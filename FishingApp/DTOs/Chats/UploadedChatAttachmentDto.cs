namespace FishingApp.Api.DTOs.Chat;

public class UploadedChatAttachmentDto
{
    public string FileName { get; set; } = null!;
    public string StoredFileName { get; set; } = null!;
    public string FileUrl { get; set; } = null!;
    public string ContentType { get; set; } = null!;
    public long Size { get; set; }
    public string AttachmentType { get; set; } = null!;
}