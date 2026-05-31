namespace FishingApp.Api.DTOs.Chat;

public class CreateChatMessageRequest
{
    public string? Text { get; set; }
    public Guid? ReplyToMessageId { get; set; }
    public Guid? SharedFishingEntryId { get; set; }
    public List<UploadedChatAttachmentDto> Attachments { get; set; } = new();
}
