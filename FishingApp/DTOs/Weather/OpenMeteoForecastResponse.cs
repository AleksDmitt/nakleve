using System.Text.Json.Serialization;

namespace FishingApp.Api.DTOs.Weather;

public class OpenMeteoForecastResponse
{
    [JsonPropertyName("latitude")]
    public double Latitude { get; set; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; set; }

    [JsonPropertyName("current")]
    public OpenMeteoCurrent? Current { get; set; }

    [JsonPropertyName("hourly")]
    public OpenMeteoHourly? Hourly { get; set; }

    [JsonPropertyName("daily")]
    public OpenMeteoDaily? Daily { get; set; }
}

public class OpenMeteoCurrent
{
    [JsonPropertyName("time")]
    public DateTime? Time { get; set; }

    [JsonPropertyName("temperature_2m")]
    public double? Temperature { get; set; }

    [JsonPropertyName("relative_humidity_2m")]
    public double? Humidity { get; set; }

    [JsonPropertyName("pressure_msl")]
    public double? Pressure { get; set; }

    [JsonPropertyName("wind_speed_10m")]
    public double? WindSpeed { get; set; }

    [JsonPropertyName("weather_code")]
    public int? WeatherCode { get; set; }

    [JsonPropertyName("precipitation")]
    public double? Precipitation { get; set; }
}

public class OpenMeteoHourly
{
    [JsonPropertyName("time")]
    public List<DateTime> Time { get; set; } = new();

    [JsonPropertyName("temperature_2m")]
    public List<double?> Temperature { get; set; } = new();

    [JsonPropertyName("relative_humidity_2m")]
    public List<double?> Humidity { get; set; } = new();

    [JsonPropertyName("pressure_msl")]
    public List<double?> Pressure { get; set; } = new();

    [JsonPropertyName("wind_speed_10m")]
    public List<double?> WindSpeed { get; set; } = new();

    [JsonPropertyName("precipitation")]
    public List<double?> Precipitation { get; set; } = new();

    [JsonPropertyName("weather_code")]
    public List<int?> WeatherCode { get; set; } = new();
}

public class OpenMeteoDaily
{
    [JsonPropertyName("time")]
    public List<DateOnly> Time { get; set; } = new();

    [JsonPropertyName("weather_code")]
    public List<int?> WeatherCode { get; set; } = new();

    [JsonPropertyName("temperature_2m_max")]
    public List<double?> TemperatureMax { get; set; } = new();

    [JsonPropertyName("temperature_2m_min")]
    public List<double?> TemperatureMin { get; set; } = new();

    [JsonPropertyName("precipitation_sum")]
    public List<double?> PrecipitationSum { get; set; } = new();

    [JsonPropertyName("wind_speed_10m_max")]
    public List<double?> WindSpeedMax { get; set; } = new();

    [JsonPropertyName("sunrise")]
    public List<DateTime> Sunrise { get; set; } = new();

    [JsonPropertyName("sunset")]
    public List<DateTime> Sunset { get; set; } = new();

    [JsonPropertyName("daylight_duration")]
    public List<double?> DaylightDuration { get; set; } = new();
}
