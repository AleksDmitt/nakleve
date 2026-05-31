namespace FishingApp.Api.DTOs.Companions;

public class CompanionRequestDetailsResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string? Region { get; set; }
    public DateTime PlannedDate { get; set; }
    public string? MeetingPoint { get; set; }
    public int SeatsCount { get; set; }
    public string Status { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public int ResponsesCount { get; set; }
    public int PendingResponsesCount { get; set; }
    public int AcceptedCount { get; set; }
    public bool IsCurrentUserResponded { get; set; }
    public Guid? CurrentUserResponseId { get; set; }
    public string? CurrentUserResponseStatus { get; set; }
    public List<CompanionResponseDto> Responses { get; set; } = new();
}
