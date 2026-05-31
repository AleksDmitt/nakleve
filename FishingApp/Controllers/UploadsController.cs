using FishingApp.Api.DTOs.Common;
using FishingApp.Api.Settings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FishingApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UploadsController : ControllerBase
{
    private const long AvatarMaxSizeBytes = 10 * 1024 * 1024;
    private const long FishingMediaMaxSizeBytes = 100 * 1024 * 1024;

    private static readonly Dictionary<string, string[]> AllowedAvatarContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = new[] { "image/jpeg" },
        [".jpeg"] = new[] { "image/jpeg" },
        [".png"] = new[] { "image/png" },
        [".webp"] = new[] { "image/webp" }
    };

    private static readonly Dictionary<string, string[]> AllowedFishingContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = new[] { "image/jpeg" },
        [".jpeg"] = new[] { "image/jpeg" },
        [".png"] = new[] { "image/png" },
        [".webp"] = new[] { "image/webp" },

        [".mp4"] = new[] { "video/mp4" },
        [".webm"] = new[] { "video/webm" },
        [".mov"] = new[] { "video/quicktime" },
        [".m4v"] = new[] { "video/x-m4v", "video/mp4" }
    };

    private readonly ILogger<UploadsController> _logger;
    private readonly UploadsSettings _uploadsSettings;

    public UploadsController(
        ILogger<UploadsController> logger,
        Microsoft.Extensions.Options.IOptions<UploadsSettings> uploadsOptions)
    {
        _logger = logger;
        _uploadsSettings = uploadsOptions.Value;
    }

    [HttpPost("avatar")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(AvatarMaxSizeBytes)]
    public async Task<IActionResult> UploadAvatar([FromForm] FileUploadRequest request)
    {
        try
        {
            var validationError = ValidateFile(
                request.File,
                AllowedAvatarContentTypes,
                AvatarMaxSizeBytes,
                "Разрешены только изображения: jpg, jpeg, png, webp.",
                "Размер аватара не должен превышать 10 МБ.");

            if (validationError != null)
                return validationError;

            var file = request.File!;
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();

            var fileUrl = await SaveFileAsync(file, "avatars", extension);

            return Ok(new FileUploadResponse
            {
                FileUrl = fileUrl
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при загрузке аватара.");
            return StatusCode(500, new
            {
                message = "Ошибка сервера при загрузке аватара."
            });
        }
    }

    [HttpPost("fishing-photo")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(FishingMediaMaxSizeBytes)]
    public async Task<IActionResult> UploadFishingPhoto([FromForm] FileUploadRequest request)
    {
        try
        {
            var validationError = ValidateFile(
                request.File,
                AllowedFishingContentTypes,
                FishingMediaMaxSizeBytes,
                "Разрешены только фото и видео: jpg, jpeg, png, webp, mp4, webm, mov, m4v.",
                "Размер файла не должен превышать 100 МБ.");

            if (validationError != null)
                return validationError;

            var file = request.File!;
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();

            var fileUrl = await SaveFileAsync(file, "fishing", extension);

            return Ok(new FileUploadResponse
            {
                FileUrl = fileUrl
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при загрузке файла записи.");
            return StatusCode(500, new
            {
                message = "Ошибка сервера при загрузке файла."
            });
        }
    }

    private BadRequestObjectResult? ValidateFile(
        IFormFile? file,
        IReadOnlyDictionary<string, string[]> allowedContentTypesByExtension,
        long maxSizeBytes,
        string extensionMessage,
        string sizeMessage)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "Файл не выбран." });

        if (file.Length > maxSizeBytes)
            return BadRequest(new { message = sizeMessage });

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(extension) ||
            !allowedContentTypesByExtension.TryGetValue(extension, out var allowedContentTypes))
        {
            return BadRequest(new { message = extensionMessage });
        }

        if (string.IsNullOrWhiteSpace(file.ContentType) ||
            !allowedContentTypes.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Тип файла не соответствует расширению." });
        }

        if (FileNameContainsUnsafeChars(file.FileName))
            return BadRequest(new { message = "Недопустимое имя файла." });

        return null;
    }

    private async Task<string> SaveFileAsync(IFormFile file, string folderName, string extension)
    {
        var uploadsRoot = _uploadsSettings.GetRootPath();
        var targetFolder = Path.Combine(uploadsRoot, folderName);
        Directory.CreateDirectory(targetFolder);

        var fileName = $"{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(targetFolder, fileName);

        await using var stream = new FileStream(filePath, FileMode.CreateNew);
        await file.CopyToAsync(stream);

        return $"{_uploadsSettings.GetRequestPath()}/{folderName}/{fileName}";
    }

    private static bool FileNameContainsUnsafeChars(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return true;

        var originalName = Path.GetFileName(fileName);

        return originalName.Contains("..", StringComparison.Ordinal) ||
               originalName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0;
    }
}
