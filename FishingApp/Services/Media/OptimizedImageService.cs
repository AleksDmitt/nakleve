using FishingApp.Api.Settings;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace FishingApp.Api.Services.Media;

public sealed class OptimizedImageService : IOptimizedImageService
{
    private static readonly HashSet<string> OptimizableImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    };

    private readonly UploadsSettings _uploadsSettings;

    public OptimizedImageService(IOptions<UploadsSettings> uploadsOptions)
    {
        _uploadsSettings = uploadsOptions.Value;
    }

    public async Task<OptimizedUploadResult> SaveUploadAsync(
        IFormFile file,
        string folderName,
        string extension,
        ImageOptimizationOptions options)
    {
        var uploadsRoot = _uploadsSettings.GetRootPath();
        var targetFolder = Path.Combine(uploadsRoot, folderName);
        Directory.CreateDirectory(targetFolder);

        var baseFileName = Guid.NewGuid().ToString("N");
        var storedFileName = $"{baseFileName}{extension}";
        var originalPath = Path.Combine(targetFolder, storedFileName);

        await using (var stream = new FileStream(originalPath, FileMode.CreateNew))
        {
            await file.CopyToAsync(stream);
        }

        var requestPath = _uploadsSettings.GetRequestPath();
        var originalUrl = $"{requestPath}/{folderName}/{storedFileName}";

        if (!IsOptimizableImage(extension, file.ContentType))
        {
            return new OptimizedUploadResult
            {
                FileUrl = originalUrl,
                StoredFileName = storedFileName
            };
        }

        string? previewUrl = null;
        string? thumbnailUrl = null;

        if (options.PreviewMaxSide.HasValue)
        {
            var previewFileName = $"{baseFileName}_preview.webp";
            var previewPath = Path.Combine(targetFolder, previewFileName);

            if (await TryCreateWebpVariantAsync(originalPath, previewPath, options.PreviewMaxSide.Value, options.PreviewQuality))
            {
                previewUrl = $"{requestPath}/{folderName}/{previewFileName}";
            }
        }

        if (options.ThumbnailMaxSide.HasValue)
        {
            var thumbnailFileName = $"{baseFileName}_thumb.webp";
            var thumbnailPath = Path.Combine(targetFolder, thumbnailFileName);

            if (await TryCreateWebpVariantAsync(originalPath, thumbnailPath, options.ThumbnailMaxSide.Value, options.ThumbnailQuality))
            {
                thumbnailUrl = $"{requestPath}/{folderName}/{thumbnailFileName}";
            }
        }

        return new OptimizedUploadResult
        {
            FileUrl = originalUrl,
            StoredFileName = storedFileName,
            PreviewUrl = previewUrl,
            ThumbnailUrl = thumbnailUrl
        };
    }

    public string? GetPreviewUrl(string? originalUrl)
    {
        return GetExistingVariantUrl(originalUrl, "preview");
    }

    public string? GetThumbnailUrl(string? originalUrl)
    {
        return GetExistingVariantUrl(originalUrl, "thumb");
    }

    private string? GetExistingVariantUrl(string? originalUrl, string suffix)
    {
        var normalizedUrl = NormalizeUrl(originalUrl);
        if (string.IsNullOrWhiteSpace(normalizedUrl))
            return null;

        var requestPath = _uploadsSettings.GetRequestPath();

        if (!normalizedUrl.StartsWith(requestPath + "/", StringComparison.OrdinalIgnoreCase))
            return null;

        var relativePath = normalizedUrl[(requestPath.Length + 1)..];
        var directory = Path.GetDirectoryName(relativePath)?.Replace('\\', '/');
        var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(relativePath);

        if (string.IsNullOrWhiteSpace(directory) || string.IsNullOrWhiteSpace(fileNameWithoutExtension))
            return null;

        var variantFileName = $"{fileNameWithoutExtension}_{suffix}.webp";
        var physicalPath = Path.Combine(_uploadsSettings.GetRootPath(), directory, variantFileName);

        if (!File.Exists(physicalPath))
            return null;

        return $"{requestPath}/{directory}/{variantFileName}";
    }

    private static async Task<bool> TryCreateWebpVariantAsync(
        string originalPath,
        string targetPath,
        int maxSide,
        int quality)
    {
        try
        {
            using var image = await Image.LoadAsync(originalPath);

            image.Mutate(context =>
            {
                context.AutoOrient();

                var currentMaxSide = Math.Max(image.Width, image.Height);
                if (currentMaxSide > maxSide)
                {
                    var ratio = maxSide / (double)currentMaxSide;
                    var width = Math.Max(1, (int)Math.Round(image.Width * ratio));
                    var height = Math.Max(1, (int)Math.Round(image.Height * ratio));

                    context.Resize(new ResizeOptions
                    {
                        Size = new Size(width, height),
                        Mode = ResizeMode.Max
                    });
                }
            });

            await image.SaveAsWebpAsync(targetPath, new WebpEncoder
            {
                Quality = Math.Clamp(quality, 1, 100)
            });

            return true;
        }
        catch
        {
            if (File.Exists(targetPath))
                File.Delete(targetPath);

            return false;
        }
    }

    private static bool IsOptimizableImage(string extension, string? contentType)
    {
        return OptimizableImageExtensions.Contains(extension) &&
               (contentType?.StartsWith("image/", StringComparison.OrdinalIgnoreCase) ?? false);
    }

    private static string NormalizeUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var normalized = value.Trim();

        if (Uri.TryCreate(normalized, UriKind.Absolute, out var absoluteUri))
            return absoluteUri.AbsolutePath;

        return normalized;
    }
}
