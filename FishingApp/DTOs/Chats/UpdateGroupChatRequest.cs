namespace FishingApp.Api.DTOs.Chat;

public class UpdateGroupChatRequest
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? AvatarUrl { get; set; }
    public bool CanMembersInvite { get; set; }
}