namespace FishingApp.Api.DTOs.Weather;

public class WeatherResponse
{
    public double Latitude { get; set; }
    public double Longitude { get; set; }

    public DateOnly Date { get; set; }
    public string? PlaceName { get; set; }
    public bool IsHistorical { get; set; }

    public double? Temperature { get; set; }
    public double? WindSpeed { get; set; }
    public double? Pressure { get; set; }
    public double? Humidity { get; set; }
    public double? Precipitation { get; set; }
    public DateTime? Sunrise { get; set; }
    public DateTime? Sunset { get; set; }
    public double? DaylightDuration { get; set; }
    public int? WeatherCode { get; set; }
    public string Description { get; set; } = string.Empty;

    public DateTime? ForecastTime { get; set; }

    public List<HourlyWeatherResponse> Hourly { get; set; } = new();
    public List<DailyWeatherResponse> Daily { get; set; } = new();
}

public class HourlyWeatherResponse
{
    public DateTime Time { get; set; }

    public double? Temperature { get; set; }
    public double? WindSpeed { get; set; }
    public double? Pressure { get; set; }
    public double? Humidity { get; set; }
    public double? Precipitation { get; set; }

    public int? WeatherCode { get; set; }
    public string Description { get; set; } = string.Empty;
}

public class DailyWeatherResponse
{
    public DateOnly Date { get; set; }

    public double? TemperatureMax { get; set; }
    public double? TemperatureMin { get; set; }
    public double? Precipitation { get; set; }
    public double? WindSpeedMax { get; set; }

    public int? WeatherCode { get; set; }
    public string Description { get; set; } = string.Empty;

    public DateTime? Sunrise { get; set; }
    public DateTime? Sunset { get; set; }
    public double? DaylightDuration { get; set; }
}
