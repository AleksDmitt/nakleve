namespace FishingApp.Api.DTOs.Chat;

public class GroupChatDetailsResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? AvatarUrl { get; set; }
    public string Type { get; set; } = null!;
    public bool CanMembersInvite { get; set; }
    public string? InviteCode { get; set; }
    public DateTime CreatedAt { get; set; }

    public Guid? CreatedByUserId { get; set; }
    public List<ChatParticipantResponse> Participants { get; set; } = new();
    public bool IsDeletedByOwner { get; set; }
    public string? CurrentUserStatus { get; set; }
    public bool CanSendMessages { get; set; }
    public string? SystemMessage { get; set; }
    public bool CurrentUserIsMuted { get; set; }
}