using Microsoft.AspNetCore.Http;

namespace FishingApp.Api.Services.Media;

public interface IOptimizedImageService
{
    Task<OptimizedUploadResult> SaveUploadAsync(
        IFormFile file,
        string folderName,
        string extension,
        ImageOptimizationOptions options);

    string? GetPreviewUrl(string? originalUrl);

    string? GetThumbnailUrl(string? originalUrl);
}
