namespace FishingApp.Domain.Entities;

public class UserReport
{
    public Guid Id { get; set; }

    public Guid ReporterUserId { get; set; }
    public AppUser ReporterUser { get; set; } = null!;

    public Guid TargetUserId { get; set; }
    public AppUser TargetUser { get; set; } = null!;

    public string ReasonCode { get; set; } = null!;
    public string? ReasonText { get; set; }

    public string Status { get; set; } = "New";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? AdminChatId { get; set; }
}
