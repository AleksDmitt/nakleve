namespace FishingApp.Domain.Entities;

public class ChatMessageAttachment
{
    public Guid Id { get; set; }

    public Guid ChatMessageId { get; set; }
    public ChatMessage ChatMessage { get; set; } = null!;

    public string FileName { get; set; } = null!;
    public string StoredFileName { get; set; } = null!;
    public string FileUrl { get; set; } = null!;
    public string ContentType { get; set; } = null!;
    public long Size { get; set; }

    public string AttachmentType { get; set; } = null!; // Image / Video / Document / Audio / Other
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}