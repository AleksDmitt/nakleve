namespace FishingApp.Api.DTOs.Profile;

public class UpdateNotificationSettingsRequest
{
    public bool ChatToastsEnabled { get; set; } = true;
    public bool HideChatMessageTextInNotifications { get; set; } = false;
}
