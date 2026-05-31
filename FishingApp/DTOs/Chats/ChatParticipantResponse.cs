namespace FishingApp.Api.DTOs.Chat;

public class ChatParticipantResponse
{
    public Guid UserId { get; set; }
    public string UserName { get; set; } = null!;
    public string? AvatarUrl { get; set; }
    public string? Region { get; set; }
    public string Role { get; set; } = null!;
    public DateTime JoinedAt { get; set; }
}