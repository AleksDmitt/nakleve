using System.Globalization;
using System.Text.Json;
using FishingApp.Api.DTOs.Weather;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FishingApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class WeatherController : ControllerBase
{
    private const int MaxPlaceNameLength = 120;
    private const int MaxForecastDaysAhead = 16;
    private const int MaxHistoricalYearsBack = 5;

    private readonly IHttpClientFactory _httpClientFactory;

    public WeatherController(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    [HttpGet]
    public async Task<IActionResult> GetWeather(
        [FromQuery] double lat,
        [FromQuery] double lon,
        [FromQuery] DateOnly? date,
        [FromQuery] string? placeName)
    {
        if (!double.IsFinite(lat) || lat < -90 || lat > 90)
            return BadRequest(new { message = "Широта должна быть в диапазоне от -90 до 90." });

        if (!double.IsFinite(lon) || lon < -180 || lon > 180)
            return BadRequest(new { message = "Долгота должна быть в диапазоне от -180 до 180." });

        var requestedDate = date ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        if (requestedDate > today.AddDays(MaxForecastDaysAhead))
            return BadRequest(new { message = $"Прогноз доступен максимум на {MaxForecastDaysAhead} дней вперёд." });

        if (requestedDate < today.AddYears(-MaxHistoricalYearsBack))
            return BadRequest(new { message = $"Архив погоды доступен максимум за последние {MaxHistoricalYearsBack} лет." });

        var isHistorical = requestedDate < today;
        var endDate = isHistorical ? requestedDate : requestedDate.AddDays(6);

        var client = _httpClientFactory.CreateClient();

        var latString = lat.ToString(CultureInfo.InvariantCulture);
        var lonString = lon.ToString(CultureInfo.InvariantCulture);
        var startDateString = requestedDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var endDateString = endDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        var baseUrl = isHistorical
            ? "https://archive-api.open-meteo.com/v1/archive"
            : "https://api.open-meteo.com/v1/forecast";

        var currentPart = isHistorical
            ? string.Empty
            : "&current=temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,precipitation,weather_code";

        var url =
            $"{baseUrl}" +
            $"?latitude={latString}" +
            $"&longitude={lonString}" +
            $"&start_date={startDateString}" +
            $"&end_date={endDateString}" +
            $"&hourly=temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,precipitation,weather_code" +
            $"&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset,daylight_duration" +
            currentPart +
            $"&timezone=auto" +
            $"&wind_speed_unit=ms";

        var response = await client.GetAsync(url, HttpContext.RequestAborted);
        var raw = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);

        if (!response.IsSuccessStatusCode)
        {
            return StatusCode(502, new
            {
                message = "Не удалось получить погоду от внешнего сервиса."
            });
        }

        if (string.IsNullOrWhiteSpace(raw))
        {
            return StatusCode(502, new
            {
                message = "Сервис погоды вернул пустой ответ."
            });
        }

        try
        {
            var options = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            };

            var weatherData = JsonSerializer.Deserialize<OpenMeteoForecastResponse>(raw, options);

            if (weatherData?.Hourly == null || weatherData.Hourly.Time.Count == 0)
            {
                return StatusCode(502, new
                {
                    message = "Сервис погоды вернул JSON без почасовой погоды."
                });
            }

            var hourly = BuildHourly(weatherData.Hourly);
            var daily = BuildDaily(weatherData.Daily);
            var requestedDayHourly = hourly
                .Where(x => DateOnly.FromDateTime(x.Time) == requestedDate)
                .ToList();

            var mainHour = SelectMainHour(requestedDayHourly.Count > 0 ? requestedDayHourly : hourly, requestedDate, isHistorical);
            var selectedDay = daily.FirstOrDefault(x => x.Date == requestedDate) ?? daily.FirstOrDefault();
            var useCurrent = !isHistorical && requestedDate == today && weatherData.Current != null;

            var weatherCode = useCurrent
                ? weatherData.Current?.WeatherCode ?? mainHour?.WeatherCode ?? selectedDay?.WeatherCode
                : mainHour?.WeatherCode ?? selectedDay?.WeatherCode;

            var result = new WeatherResponse
            {
                Latitude = weatherData.Latitude,
                Longitude = weatherData.Longitude,
                Date = requestedDate,
                PlaceName = NormalizeOptionalText(placeName, MaxPlaceNameLength),
                IsHistorical = isHistorical,

                Temperature = useCurrent ? weatherData.Current?.Temperature ?? mainHour?.Temperature : mainHour?.Temperature,
                WindSpeed = useCurrent ? weatherData.Current?.WindSpeed ?? mainHour?.WindSpeed : mainHour?.WindSpeed,
                Pressure = useCurrent ? weatherData.Current?.Pressure ?? mainHour?.Pressure : mainHour?.Pressure,
                Humidity = useCurrent ? weatherData.Current?.Humidity ?? mainHour?.Humidity : mainHour?.Humidity,
                Precipitation = useCurrent ? weatherData.Current?.Precipitation ?? mainHour?.Precipitation : mainHour?.Precipitation,
                WeatherCode = weatherCode,
                Description = GetWeatherDescription(weatherCode),
                ForecastTime = useCurrent ? weatherData.Current?.Time ?? mainHour?.Time : mainHour?.Time,
                Sunrise = selectedDay?.Sunrise,
                Sunset = selectedDay?.Sunset,
                DaylightDuration = selectedDay?.DaylightDuration,

                Hourly = hourly,
                Daily = daily
            };

            return Ok(result);
        }
        catch (JsonException)
        {
            return StatusCode(502, new
            {
                message = "Сервис погоды вернул неожиданный формат ответа."
            });
        }
    }

    private static string? NormalizeOptionalText(string? value, int maxLength)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static List<HourlyWeatherResponse> BuildHourly(OpenMeteoHourly hourly)
    {
        var result = new List<HourlyWeatherResponse>();

        for (var i = 0; i < hourly.Time.Count; i++)
        {
            var weatherCode = GetListValue(hourly.WeatherCode, i);

            result.Add(new HourlyWeatherResponse
            {
                Time = hourly.Time[i],
                Temperature = GetListValue(hourly.Temperature, i),
                WindSpeed = GetListValue(hourly.WindSpeed, i),
                Pressure = GetListValue(hourly.Pressure, i),
                Humidity = GetListValue(hourly.Humidity, i),
                Precipitation = GetListValue(hourly.Precipitation, i),
                WeatherCode = weatherCode,
                Description = GetWeatherDescription(weatherCode)
            });
        }

        return result;
    }

    private static List<DailyWeatherResponse> BuildDaily(OpenMeteoDaily? daily)
    {
        var result = new List<DailyWeatherResponse>();

        if (daily == null || daily.Time.Count == 0)
            return result;

        for (var i = 0; i < daily.Time.Count; i++)
        {
            var weatherCode = GetListValue(daily.WeatherCode, i);

            result.Add(new DailyWeatherResponse
            {
                Date = daily.Time[i],
                TemperatureMax = GetListValue(daily.TemperatureMax, i),
                TemperatureMin = GetListValue(daily.TemperatureMin, i),
                Precipitation = GetListValue(daily.PrecipitationSum, i),
                WindSpeedMax = GetListValue(daily.WindSpeedMax, i),
                WeatherCode = weatherCode,
                Description = GetWeatherDescription(weatherCode),
                Sunrise = GetListValue(daily.Sunrise, i),
                Sunset = GetListValue(daily.Sunset, i),
                DaylightDuration = GetListValue(daily.DaylightDuration, i)
            });
        }

        return result;
    }

    private static HourlyWeatherResponse? SelectMainHour(
        List<HourlyWeatherResponse> hourly,
        DateOnly requestedDate,
        bool isHistorical)
    {
        if (hourly.Count == 0)
            return null;

        if (isHistorical)
        {
            return hourly
                .OrderBy(x => Math.Abs(x.Time.Hour - 12))
                .FirstOrDefault();
        }

        var now = DateTime.Now;

        if (DateOnly.FromDateTime(now) == requestedDate)
        {
            return hourly
                .OrderBy(x => Math.Abs((x.Time - now).TotalMinutes))
                .FirstOrDefault();
        }

        return hourly
            .OrderBy(x => Math.Abs(x.Time.Hour - 12))
            .FirstOrDefault();
    }

    private static T? GetListValue<T>(List<T>? list, int index)
    {
        if (list == null || index < 0 || index >= list.Count)
            return default;

        return list[index];
    }

    private static string GetWeatherDescription(int? code)
    {
        return code switch
        {
            0 => "Ясно",
            1 => "Преимущественно ясно",
            2 => "Переменная облачность",
            3 => "Пасмурно",
            45 => "Туман",
            48 => "Изморозный туман",
            51 => "Слабая морось",
            53 => "Умеренная морось",
            55 => "Сильная морось",
            61 => "Слабый дождь",
            63 => "Умеренный дождь",
            65 => "Сильный дождь",
            71 => "Слабый снег",
            73 => "Умеренный снег",
            75 => "Сильный снег",
            80 => "Кратковременный слабый ливень",
            81 => "Кратковременный умеренный ливень",
            82 => "Кратковременный сильный ливень",
            95 => "Гроза",
            96 => "Гроза со слабым градом",
            99 => "Гроза с сильным градом",
            _ => "Нет описания"
        };
    }
}
