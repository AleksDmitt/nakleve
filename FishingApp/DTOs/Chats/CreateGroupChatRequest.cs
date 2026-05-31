namespace FishingApp.Api.DTOs.Chat;

public class CreateGroupChatRequest
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? AvatarUrl { get; set; }
    public bool CanMembersInvite { get; set; } = false;

    public List<Guid> ParticipantIds { get; set; } = new();
}