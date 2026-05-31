using FishingApp.Domain.Enums;

namespace FishingApp.Domain.Entities;

public class Chat
{
    public Guid Id { get; set; }

    public Guid? FirstUserId { get; set; }
    public Guid? SecondUserId { get; set; }

    public Guid? CreatedByUserId { get; set; }

    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? AvatarUrl { get; set; }

    public ChatType Type { get; set; }
    public string? Region { get; set; }

    public string? InviteCode { get; set; }
    public bool CanMembersInvite { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public AppUser? CreatedByUser { get; set; }

    public ICollection<ChatParticipant> Participants { get; set; } = new List<ChatParticipant>();
    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
    public ICollection<PrivateChatUserState> PrivateChatStates { get; set; } = new List<PrivateChatUserState>();
    public bool IsDeletedByOwner { get; set; } = false;
    public DateTime? DeletedByOwnerAt { get; set; }
    public Guid? DeletedByOwnerUserId { get; set; }
}