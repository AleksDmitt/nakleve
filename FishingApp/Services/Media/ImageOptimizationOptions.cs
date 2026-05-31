namespace FishingApp.Api.Services.Media;

public sealed class ImageOptimizationOptions
{
    public int? PreviewMaxSide { get; init; }
    public int? ThumbnailMaxSide { get; init; }
    public int PreviewQuality { get; init; } = 82;
    public int ThumbnailQuality { get; init; } = 78;
}

public sealed class OptimizedUploadResult
{
    public string FileUrl { get; init; } = string.Empty;
    public string StoredFileName { get; init; } = string.Empty;
    public string? PreviewUrl { get; init; }
    public string? ThumbnailUrl { get; init; }
}
