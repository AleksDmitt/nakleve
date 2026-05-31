using FishingApp.Domain.Enums;

namespace FishingApp.Domain.Entities;

public class FishingEntry
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    public string Title { get; set; } = null!;
    public string? Description { get; set; }

    // Оставляем старое поле для совместимости со старым frontend/существующими данными.
    // Теперь сюда записывается начало рыбалки.
    public DateTime FishingDate { get; set; }

    // Новый нормальный промежуток ловли.
    public DateTime FishingStartedAt { get; set; }
    public DateTime? FishingEndedAt { get; set; }

    public string? LocationName { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    public string? CatchType { get; set; }
    public decimal? CatchWeight { get; set; }
    public string? Bait { get; set; }

    // Пользователь это больше не вводит вручную.
    // Поле заполняется backend'ом по координатам и времени рыбалки.
    public string? WeatherSummary { get; set; }

    public string? PhotoUrl { get; set; }

    public List<FishingEntryMedia> Media { get; set; } = new();

    public FishingEntryVisibility Visibility { get; set; } = FishingEntryVisibility.Private;
    public bool IsPublishedToFeed { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public AppUser User { get; set; } = null!;
}
