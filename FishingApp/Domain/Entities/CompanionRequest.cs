using FishingApp.Domain.Enums;

namespace FishingApp.Domain.Entities;

public class CompanionRequest
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }

    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string? Region { get; set; }
    public DateTime PlannedDate { get; set; }
    public string? MeetingPoint { get; set; }
    public int SeatsCount { get; set; } = 1;

    public CompanionRequestStatus Status { get; set; } = CompanionRequestStatus.Open;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public AppUser User { get; set; } = null!;
    public ICollection<CompanionResponse> Responses { get; set; } = new List<CompanionResponse>();
}
