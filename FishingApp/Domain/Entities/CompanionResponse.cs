using FishingApp.Domain.Enums;

namespace FishingApp.Domain.Entities;

public class CompanionResponse
{
    public Guid Id { get; set; }
    public Guid RequestId { get; set; }
    public Guid UserId { get; set; }

    public string? Message { get; set; }
    public CompanionResponseStatus Status { get; set; } = CompanionResponseStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public CompanionRequest Request { get; set; } = null!;
    public AppUser User { get; set; } = null!;
}
