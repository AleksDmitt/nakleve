namespace FishingApp.Domain.Entities;

public class WeatherCache
{
    public Guid Id { get; set; }

    public double Latitude { get; set; }
    public double Longitude { get; set; }

    public DateTime ForecastDate { get; set; }
    public decimal Temperature { get; set; }
    public decimal WindSpeed { get; set; }
    public decimal Pressure { get; set; }
    public decimal Humidity { get; set; }

    public string? Description { get; set; }
    public DateTime LoadedAt { get; set; } = DateTime.UtcNow;
}