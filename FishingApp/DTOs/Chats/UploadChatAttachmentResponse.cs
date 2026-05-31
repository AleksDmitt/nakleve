namespace FishingApp.Api.DTOs.Chat;

public class UploadChatAttachmentResponse
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = null!;
    public string StoredFileName { get; set; } = null!;
    public string FileUrl { get; set; } = null!;
    public string ContentType { get; set; } = null!;
    public long Size { get; set; }
    public string AttachmentType { get; set; } = null!;
    public bool IsVoiceMessage { get; set; }
    public int? VoiceDurationMs { get; set; }
    public string? VoiceWaveform { get; set; }
}