namespace FishingApp.Domain.Entities;

public class ChatMessage
{
    public Guid Id { get; set; }
    public Guid ChatId { get; set; }
    public Guid UserId { get; set; }

    public string Text { get; set; } = null!;
    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    public bool IsDeleted { get; set; } = false;
    public bool IsDeletedForAll { get; set; } = false;
    public DateTime? DeletedAt { get; set; }

    public Chat Chat { get; set; } = null!;
    public AppUser User { get; set; } = null!;

    public Guid? ReplyToMessageId { get; set; }
    public ChatMessage? ReplyToMessage { get; set; }
    public ICollection<ChatMessage> Replies { get; set; } = new List<ChatMessage>();

    public Guid? SharedFishingEntryId { get; set; }
    public FishingEntry? SharedFishingEntry { get; set; }

    public bool IsForwarded { get; set; } = false;
    public Guid? ForwardedFromUserId { get; set; }
    public string? ForwardedFromUserName { get; set; }

    public ICollection<HiddenChatMessage> HiddenForUsers { get; set; } = new List<HiddenChatMessage>();
    public ICollection<ChatMessageAttachment> Attachments { get; set; } = new List<ChatMessageAttachment>();
}
