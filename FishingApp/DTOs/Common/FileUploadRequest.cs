using Microsoft.AspNetCore.Http;

namespace FishingApp.Api.DTOs.Common;

public class FileUploadRequest
{
    public IFormFile File { get; set; } = null!;
}