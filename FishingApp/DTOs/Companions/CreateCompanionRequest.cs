namespace FishingApp.Api.DTOs.Companions;

public class CreateCompanionRequest
{
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public string? Region { get; set; }
    public DateTime PlannedDate { get; set; }
    public string? MeetingPoint { get; set; }
    public int SeatsCount { get; set; } = 1;
}
