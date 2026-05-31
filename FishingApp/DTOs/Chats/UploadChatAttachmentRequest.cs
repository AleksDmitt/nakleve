using Microsoft.AspNetCore.Http;

namespace FishingApp.Api.DTOs.Chat;

public class UploadChatAttachmentRequest
{
    public IFormFile File { get; set; } = null!;
}