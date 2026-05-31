using Microsoft.AspNetCore.Http;

namespace FishingApp.Api.DTOs.Chat;

public class UploadChatAvatarRequest
{
    public IFormFile File { get; set; } = null!;
}