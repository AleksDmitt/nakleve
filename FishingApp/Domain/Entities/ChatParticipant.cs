using FishingApp.Domain.Enums;

namespace FishingApp.Domain.Entities;

public class ChatParticipant
{
    public Guid Id { get; set; }

    public Guid ChatId { get; set; }
    public Guid UserId { get; set; }

    public ChatParticipantRole Role { get; set; } = ChatParticipantRole.Member;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public bool IsMuted { get; set; } = false;

    public Chat Chat { get; set; } = null!;
    public AppUser User { get; set; } = null!;
    public ChatParticipantStatus Status { get; set; } = ChatParticipantStatus.Active;
    public DateTime? StatusChangedAt { get; set; }
}