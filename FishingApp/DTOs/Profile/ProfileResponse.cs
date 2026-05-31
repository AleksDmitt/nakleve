namespace FishingApp.Api.DTOs.Profile;

public class ProfileResponse
{
    public Guid Id { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Region { get; set; }
    public string? About { get; set; }
    public string? AvatarUrl { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool ChatToastsEnabled { get; set; } = true;
    public bool HideChatMessageTextInNotifications { get; set; } = false;
}
