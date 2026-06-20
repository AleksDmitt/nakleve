using FishingApp.Api.DTOs.Chat;
using FishingApp.Api.DTOs.FishingEntries;
using FishingApp.Api.Hubs;
using FishingApp.Api.Settings;
using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using FishingApp.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace FishingApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly UserManager<AppUser> _userManager;
    private readonly IHubContext<ChatHub> _chatHub;
    private readonly UploadsSettings _uploadsSettings;

    private const int MaxChatMessageTextLength = 4000;
    private const int MaxChatAttachmentsPerMessage = 10;
    private const long MaxChatAvatarSizeBytes = 5 * 1024 * 1024;
    private const long MaxChatAttachmentSizeBytes = 100 * 1024 * 1024;

    private static readonly Dictionary<string, string[]> AllowedChatAvatarContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = new[] { "image/jpeg" },
        [".jpeg"] = new[] { "image/jpeg" },
        [".png"] = new[] { "image/png" },
        [".webp"] = new[] { "image/webp" }
    };

    private static readonly Dictionary<string, string[]> AllowedChatAttachmentContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = new[] { "image/jpeg" },
        [".jpeg"] = new[] { "image/jpeg" },
        [".png"] = new[] { "image/png" },
        [".webp"] = new[] { "image/webp" },
        [".gif"] = new[] { "image/gif" },

        [".mp4"] = new[] { "video/mp4", "audio/mp4", "audio/x-m4a" },
        [".webm"] = new[] { "video/webm", "audio/webm", "application/octet-stream" },
        [".mov"] = new[] { "video/quicktime", "video/mp4" },
        [".avi"] = new[] { "video/x-msvideo", "video/avi" },
        [".mkv"] = new[] { "video/x-matroska", "video/webm" },

        [".mp3"] = new[] { "audio/mpeg", "audio/mp3", "audio/x-mpeg" },
        [".wav"] = new[] { "audio/wav", "audio/x-wav", "audio/wave" },
        [".ogg"] = new[] { "audio/ogg", "application/ogg", "video/ogg" },
        [".m4a"] = new[] { "audio/mp4", "audio/x-m4a", "audio/m4a", "application/octet-stream" },
        [".aac"] = new[] { "audio/aac", "audio/aacp", "audio/x-aac", "application/octet-stream" },

        [".pdf"] = new[] { "application/pdf" },
        [".doc"] = new[] { "application/msword" },
        [".docx"] = new[] { "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
        [".xls"] = new[] { "application/vnd.ms-excel" },
        [".xlsx"] = new[] { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        [".ppt"] = new[] { "application/vnd.ms-powerpoint" },
        [".pptx"] = new[] { "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
        [".txt"] = new[] { "text/plain" },
        [".zip"] = new[] { "application/zip", "application/x-zip-compressed" },
        [".rar"] = new[] { "application/vnd.rar", "application/x-rar-compressed" }
    };


    private static string GenerateInviteCode()
    {
        return Guid.NewGuid().ToString("N")[..12];
    }

    public ChatsController(
        AppDbContext context,
        UserManager<AppUser> userManager,
        IHubContext<ChatHub> chatHub,
        Microsoft.Extensions.Options.IOptions<UploadsSettings> uploadsOptions)
    {
        _context = context;
        _userManager = userManager;
        _chatHub = chatHub;
        _uploadsSettings = uploadsOptions.Value;
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var currentUserId))
            return null;

        return currentUserId;
    }

    private static string GetDisplayName(AppUser user)
    {
        var fullName = $"{user.FirstName} {user.LastName}".Trim();

        return string.IsNullOrWhiteSpace(fullName)
            ? user.UserName ?? "Пользователь"
            : fullName;
    }

    private static string FormatUsersForSystemMessage(IReadOnlyCollection<AppUser> users)
    {
        var names = users
            .Select(GetDisplayName)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (names.Count == 0)
            return "участников";

        if (names.Count <= 3)
            return string.Join(", ", names);

        return $"{string.Join(", ", names.Take(3))} и ещё {names.Count - 3}";
    }

    private static string BuildParticipantsAddedText(IReadOnlyCollection<AppUser> addedUsers)
    {
        var names = FormatUsersForSystemMessage(addedUsers);
        return addedUsers.Count == 1
            ? $"добавил(а) в чат {names}"
            : $"добавил(а) участников: {names}";
    }

    private static string BuildGroupCreatedWithParticipantsText(IReadOnlyCollection<AppUser> addedUsers)
    {
        var names = FormatUsersForSystemMessage(addedUsers);
        return addedUsers.Count == 1
            ? $"создал(а) чат и добавил(а) {names}"
            : $"создал(а) чат и добавил(а) участников: {names}";
    }

    private async Task<ChatParticipant?> GetParticipantAsync(Guid chatId, Guid userId)
    {
        return await _context.ChatParticipants
            .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == userId);
    }

    private async Task<bool> IsPrivateCommunicationBlockedAsync(Guid firstUserId, Guid secondUserId)
    {
        return await _context.UserBlocks.AnyAsync(x =>
            (x.BlockerUserId == firstUserId && x.BlockedUserId == secondUserId) ||
            (x.BlockerUserId == secondUserId && x.BlockedUserId == firstUserId));
    }

    private async Task<AppUser?> GetBlockedPrivateChatTargetAsync(Chat chat, Guid currentUserId)
    {
        if (chat.Type != ChatType.Private)
            return null;

        var otherUserId = chat.FirstUserId == currentUserId
            ? chat.SecondUserId
            : chat.FirstUserId;

        if (!otherUserId.HasValue)
            return null;

        return await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == otherUserId.Value && x.IsBlocked);
    }

    private async Task<bool> HasAccessToChatAsync(Chat chat, Guid userId)
    {
        if (chat.Type == ChatType.Global)
            return false;

        if (chat.Type == ChatType.Private)
            return chat.FirstUserId == userId || chat.SecondUserId == userId;

        if (chat.Type == ChatType.Group)
        {
            return await _context.ChatParticipants
                .AnyAsync(x =>
                    x.ChatId == chat.Id &&
                    x.UserId == userId &&
                    x.Status != ChatParticipantStatus.Left);
        }

        if (chat.Type == ChatType.Regional)
        {
            var userRegion = await _context.Users
                .Where(x => x.Id == userId)
                .Select(x => x.Region)
                .FirstOrDefaultAsync();

            return chat.Region == userRegion;
        }

        return false;
    }

    private static bool CanSendToGroupChat(Chat chat, ChatParticipant participant)
    {
        if (chat.IsDeletedByOwner)
            return false;

        return participant.Status == ChatParticipantStatus.Active;
    }

    private static string? GetGroupSystemMessage(Chat chat, ChatParticipant participant)
    {
        if (chat.IsDeletedByOwner)
            return "Чат удалён владельцем";

        if (participant.Status == ChatParticipantStatus.Removed)
            return "Вы были исключены из чата";

        if (participant.Status == ChatParticipantStatus.Left)
            return "Вы вышли из чата";

        return null;
    }

    private static string GetAttachmentType(string contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
            return "Other";

        if (contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return "Image";

        if (contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
            return "Video";

        if (contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
            return "Audio";

        if (contentType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase) ||
            contentType.Contains("word", StringComparison.OrdinalIgnoreCase) ||
            contentType.Contains("excel", StringComparison.OrdinalIgnoreCase) ||
            contentType.Contains("powerpoint", StringComparison.OrdinalIgnoreCase) ||
            contentType.Equals("text/plain", StringComparison.OrdinalIgnoreCase) ||
            contentType.Equals("application/zip", StringComparison.OrdinalIgnoreCase) ||
            contentType.Equals("application/x-rar-compressed", StringComparison.OrdinalIgnoreCase))
        {
            return "Document";
        }

        return "Other";
    }

    private static ChatMessageAttachmentResponse MapAttachment(
        ChatMessageAttachment attachment,
        IReadOnlySet<Guid>? listenedVoiceAttachmentIds = null)
    {
        listenedVoiceAttachmentIds ??= new HashSet<Guid>();

        return new ChatMessageAttachmentResponse
        {
            Id = attachment.Id,
            FileName = attachment.FileName,
            FileUrl = attachment.FileUrl,
            ContentType = attachment.ContentType,
            Size = attachment.Size,
            AttachmentType = attachment.AttachmentType,
            IsVoiceMessage = attachment.IsVoiceMessage,
            VoiceDurationMs = attachment.VoiceDurationMs,
            VoiceWaveform = attachment.VoiceWaveform,
            IsVoiceListenedByCurrentUser = attachment.IsVoiceMessage && listenedVoiceAttachmentIds.Contains(attachment.Id)
        };
    }


    private static string NormalizeMessageText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var text = value.Trim();
        return text.Length <= MaxChatMessageTextLength
            ? text
            : text[..MaxChatMessageTextLength];
    }

    private static string NormalizeFileNameForDisplay(string? fileName)
    {
        var safeName = Path.GetFileName(fileName ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(safeName))
            return "file";

        return safeName.Length <= 120
            ? safeName
            : safeName[..120];
    }

    private static int? NormalizeVoiceDurationMs(int? value)
    {
        if (!value.HasValue)
            return null;

        return Math.Clamp(value.Value, 0, 10 * 60 * 1000);
    }

    private static string? NormalizeVoiceWaveform(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var waveform = value.Trim();
        return waveform.Length <= 2000 ? waveform : waveform[..2000];
    }

    private static string NormalizeContentTypeHeader(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
            return string.Empty;

        return contentType
            .Split(';', StringSplitOptions.RemoveEmptyEntries)[0]
            .Trim()
            .ToLowerInvariant();
    }

    private static bool IsAudioOrVideoExtension(string extension)
    {
        return extension is ".mp3" or ".wav" or ".ogg" or ".m4a" or ".aac" or ".webm" or ".mp4" or ".mov" or ".avi" or ".mkv";
    }

    private static bool IsVoiceCompatibleExtension(string extension)
    {
        return extension is ".webm" or ".mp3" or ".wav" or ".ogg" or ".m4a" or ".aac" or ".mp4";
    }

    private static bool IsAllowedContentTypeForExtension(
        string extension,
        string normalizedContentType,
        IReadOnlyCollection<string> allowedContentTypes)
    {
        if (string.IsNullOrWhiteSpace(normalizedContentType))
            return false;

        if (allowedContentTypes.Contains(normalizedContentType, StringComparer.OrdinalIgnoreCase))
            return true;

        // На мобильных браузерах голосовые записи часто приходят как audio/webm;codecs=opus,
        // audio/mp4 или даже application/octet-stream, при этом расширение остается .webm/.m4a.
        // Расширение у нас все равно проверяется по белому списку, поэтому здесь разрешаем
        // только безопасные медиасочетания, а не любой произвольный файл.
        if (IsAudioOrVideoExtension(extension) && normalizedContentType == "application/octet-stream")
            return true;

        if (extension is ".webm" or ".mp4")
            return normalizedContentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) ||
                   normalizedContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);

        if (extension is ".mp3" or ".wav" or ".ogg" or ".m4a" or ".aac")
            return normalizedContentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) ||
                   (extension == ".ogg" && normalizedContentType == "application/ogg");

        if (extension is ".mov" or ".avi" or ".mkv")
            return normalizedContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase);

        return false;
    }

    private static bool IsVoiceCompatibleContentType(string extension, string normalizedContentType)
    {
        if (!IsVoiceCompatibleExtension(extension))
            return false;

        return normalizedContentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase) ||
               normalizedContentType == "application/octet-stream" ||
               (extension == ".webm" && normalizedContentType == "video/webm") ||
               (extension == ".ogg" && normalizedContentType == "application/ogg");
    }

    private BadRequestObjectResult? ValidateUploadedFile(
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

        var normalizedContentType = NormalizeContentTypeHeader(file.ContentType);

        if (!IsAllowedContentTypeForExtension(extension, normalizedContentType, allowedContentTypes))
        {
            return BadRequest(new { message = "Тип файла не соответствует расширению." });
        }

        var originalName = Path.GetFileName(file.FileName);
        if (string.IsNullOrWhiteSpace(originalName) ||
            originalName.Contains("..", StringComparison.Ordinal) ||
            originalName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
        {
            return BadRequest(new { message = "Недопустимое имя файла." });
        }

        return null;
    }

    private async Task<(string FileUrl, string StoredFileName)> SaveChatFileAsync(
        IFormFile file,
        string folderName,
        string extension)
    {
        var uploadsRoot = _uploadsSettings.GetRootPath();
        var targetFolder = Path.Combine(uploadsRoot, folderName);
        Directory.CreateDirectory(targetFolder);

        var storedFileName = $"{Guid.NewGuid():N}{extension}";
        var filePath = Path.Combine(targetFolder, storedFileName);

        await using (var stream = new FileStream(filePath, FileMode.CreateNew))
        {
            await file.CopyToAsync(stream);
        }

        var fileUrl = $"{_uploadsSettings.GetRequestPath()}/{folderName}/{storedFileName}";
        return (fileUrl, storedFileName);
    }

    private BadRequestObjectResult? ValidateChatAttachmentRequests(List<UploadedChatAttachmentDto>? attachments)
    {
        if (attachments == null || attachments.Count == 0)
            return null;

        if (attachments.Count > MaxChatAttachmentsPerMessage)
            return BadRequest(new { message = $"К одному сообщению можно прикрепить не больше {MaxChatAttachmentsPerMessage} файлов." });

        foreach (var attachment in attachments)
        {
            if (string.IsNullOrWhiteSpace(attachment.FileUrl))
                return BadRequest(new { message = "Некорректная ссылка на вложение." });

            if (!IsLocalChatAttachmentUrl(attachment.FileUrl))
                return BadRequest(new { message = "Можно отправлять только файлы, загруженные через приложение." });

            if (attachment.Size <= 0 || attachment.Size > MaxChatAttachmentSizeBytes)
                return BadRequest(new { message = "Некорректный размер вложения." });

            var path = GetPathFromUrl(attachment.FileUrl);
            var extension = Path.GetExtension(path).ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(extension) ||
                !AllowedChatAttachmentContentTypes.TryGetValue(extension, out var allowedContentTypes))
            {
                return BadRequest(new { message = "Недопустимый тип вложения." });
            }

            var normalizedAttachmentContentType = NormalizeContentTypeHeader(attachment.ContentType);

            if (!IsAllowedContentTypeForExtension(extension, normalizedAttachmentContentType, allowedContentTypes))
            {
                return BadRequest(new { message = "Тип вложения не соответствует расширению." });
            }

            if (attachment.IsVoiceMessage)
            {
                if (!IsVoiceCompatibleContentType(extension, normalizedAttachmentContentType))
                    return BadRequest(new { message = "Голосовое сообщение должно быть аудиофайлом." });

                if (attachment.VoiceDurationMs is null or <= 0)
                    return BadRequest(new { message = "Не удалось определить длительность голосового сообщения." });

                if (attachment.VoiceDurationMs > 10 * 60 * 1000)
                    return BadRequest(new { message = "Голосовое сообщение не должно быть длиннее 10 минут." });

                if (!string.IsNullOrWhiteSpace(attachment.VoiceWaveform) && attachment.VoiceWaveform.Length > 2000)
                    return BadRequest(new { message = "Некорректные данные голосового сообщения." });
            }
        }

        return null;
    }

    private static bool IsLocalChatAttachmentUrl(string url)
    {
        var path = GetPathFromUrl(url);
        return path.StartsWith("/uploads/chat-attachments/", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetPathFromUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var absoluteUri))
            return absoluteUri.AbsolutePath;

        if (Uri.TryCreate(url, UriKind.Relative, out var relativeUri))
            return relativeUri.OriginalString;

        return string.Empty;
    }


    private static ChatSharedFishingEntryResponse? MapSharedFishingEntry(FishingEntry? entry)
    {
        if (entry == null)
            return null;

        var startedAt = entry.FishingStartedAt == default ? entry.FishingDate : entry.FishingStartedAt;

        return new ChatSharedFishingEntryResponse
        {
            Id = entry.Id,
            Title = entry.Title,
            Description = entry.Description,
            PhotoUrl = entry.PhotoUrl,
            LocationName = entry.LocationName,
            Latitude = entry.Latitude,
            Longitude = entry.Longitude,
            CatchType = entry.CatchType,
            CatchWeight = entry.CatchWeight,
            Bait = entry.Bait,
            WeatherSummary = entry.WeatherSummary,
            FishingDate = entry.FishingDate,
            FishingStartedAt = startedAt,
            FishingEndedAt = entry.FishingEndedAt,
            Visibility = entry.Visibility,
            IsPublishedToFeed = entry.IsPublishedToFeed,
            CreatedAt = entry.CreatedAt,
            UserId = entry.UserId,
            UserName = entry.User == null ? string.Empty : GetDisplayName(entry.User),
            AvatarUrl = entry.User?.AvatarUrl,
            Media = entry.Media
                .OrderBy(x => x.SortOrder)
                .Select(x => new FishingEntryMediaResponse
                {
                    Id = x.Id,
                    Url = x.Url,
                    MediaType = x.MediaType.ToString().ToLowerInvariant(),
                    SortOrder = x.SortOrder,
                    PreviewUrl = x.Url,
                    ThumbnailUrl = x.Url
                })
                .ToList()
        };
    }

    private async Task<IReadOnlyDictionary<Guid, bool>> GetReadByOthersMapAsync(
        Chat chat,
        Guid currentUserId,
        IReadOnlyCollection<ChatMessageResponse> messages)
    {
        var ownMessages = messages
            .Where(x => x.UserId == currentUserId)
            .ToList();

        if (ownMessages.Count == 0)
            return new Dictionary<Guid, bool>();

        var recipientIds = new List<Guid>();

        if (chat.Type == ChatType.Private)
        {
            var otherUserId = chat.FirstUserId == currentUserId
                ? chat.SecondUserId
                : chat.FirstUserId;

            if (otherUserId.HasValue)
                recipientIds.Add(otherUserId.Value);
        }
        else if (chat.Type == ChatType.Group)
        {
            recipientIds = await _context.ChatParticipants
                .Where(x =>
                    x.ChatId == chat.Id &&
                    x.UserId != currentUserId &&
                    x.Status == ChatParticipantStatus.Active)
                .Select(x => x.UserId)
                .ToListAsync();
        }

        if (recipientIds.Count == 0)
        {
            return ownMessages.ToDictionary(x => x.Id, _ => false);
        }

        var readStates = await _context.ChatReadStates
            .Where(x => x.ChatId == chat.Id && recipientIds.Contains(x.UserId))
            .Select(x => new { x.UserId, x.LastReadAt })
            .ToListAsync();

        var readStateByUserId = readStates
            .Where(x => x.LastReadAt.HasValue)
            .ToDictionary(x => x.UserId, x => x.LastReadAt!.Value);

        return ownMessages.ToDictionary(
            message => message.Id,
            message => recipientIds.All(recipientId =>
                readStateByUserId.TryGetValue(recipientId, out var lastReadAt) &&
                lastReadAt >= message.SentAt));
    }

    private async Task<List<Guid>> GetVoiceListenTargetUserIdsAsync(Chat chat, Guid senderUserId)
    {
        if (chat.Type == ChatType.Private)
        {
            var otherUserId = chat.FirstUserId == senderUserId
                ? chat.SecondUserId
                : chat.FirstUserId;

            return otherUserId.HasValue
                ? new List<Guid> { otherUserId.Value }
                : new List<Guid>();
        }

        if (chat.Type == ChatType.Group)
        {
            return await _context.ChatParticipants
                .AsNoTracking()
                .Where(x =>
                    x.ChatId == chat.Id &&
                    x.UserId != senderUserId &&
                    x.Status == ChatParticipantStatus.Active)
                .Select(x => x.UserId)
                .ToListAsync();
        }

        return new List<Guid>();
    }

    private static ChatMessageResponse BuildChatMessageResponse(
        ChatMessage message,
        AppUser user,
        ChatMessage? replyToMessage,
        IEnumerable<ChatMessageAttachment> attachments)
    {
        return new ChatMessageResponse
        {
            Id = message.Id,
            ChatId = message.ChatId,
            UserId = message.UserId,
            UserName = GetDisplayName(user),
            UserAvatarUrl = user.AvatarUrl,
            Text = message.Text,
            SentAt = message.SentAt,
            ReplyToMessageId = message.ReplyToMessageId,
            ReplyToUserName = replyToMessage?.User == null ? null : GetDisplayName(replyToMessage.User),
            ReplyToText = replyToMessage == null
                ? null
                : (replyToMessage.IsDeletedForAll ? "Сообщение удалено" : replyToMessage.SharedFishingEntryId.HasValue ? "Запись из ленты" : replyToMessage.Text),
            SharedFishingEntryId = message.SharedFishingEntryId,
            SharedFishingEntry = MapSharedFishingEntry(message.SharedFishingEntry),
            IsDeleted = message.IsDeleted,
            IsDeletedForAll = message.IsDeletedForAll,
            IsForwarded = message.IsForwarded,
            ForwardedFromUserId = message.ForwardedFromUserId,
            ForwardedFromUserName = message.ForwardedFromUserName,
            IsReadByOthers = false,
            Attachments = attachments
                .Select(attachment => MapAttachment(attachment))
                .ToList()
        };
    }

    private async Task<GroupChatDetailsResponse> BuildGroupChatDetailsResponse(Chat chat, Guid currentUserId)
    {
        var participants = await _context.ChatParticipants
            .Where(x => x.ChatId == chat.Id && x.Status == ChatParticipantStatus.Active)
            .Include(x => x.User)
            .OrderByDescending(x => x.Role)
            .ThenBy(x => x.User.UserName)
            .Select(x => new ChatParticipantResponse
            {
                UserId = x.UserId,
                UserName = ((x.User.FirstName ?? "") + " " + (x.User.LastName ?? "")).Trim() != "" ? ((x.User.FirstName ?? "") + " " + (x.User.LastName ?? "")).Trim() : (x.User.UserName ?? string.Empty),
                AvatarUrl = x.User.AvatarUrl,
                Region = x.User.Region,
                Role = x.Role.ToString(),
                JoinedAt = x.JoinedAt
            })
            .ToListAsync();

        var currentParticipant = await _context.ChatParticipants
            .FirstOrDefaultAsync(x => x.ChatId == chat.Id && x.UserId == currentUserId);

        var canSendMessages =
            currentParticipant != null &&
            CanSendToGroupChat(chat, currentParticipant);

        return new GroupChatDetailsResponse
        {
            Id = chat.Id,
            Name = chat.Name,
            Description = chat.Description,
            AvatarUrl = chat.AvatarUrl,
            Type = chat.Type.ToString(),
            CanMembersInvite = chat.CanMembersInvite,
            InviteCode = chat.InviteCode,
            CreatedAt = chat.CreatedAt,
            CreatedByUserId = chat.CreatedByUserId,
            Participants = participants,
            IsDeletedByOwner = chat.IsDeletedByOwner,
            CurrentUserStatus = currentParticipant?.Status.ToString(),
            CanSendMessages = canSendMessages,
            SystemMessage = currentParticipant == null
                ? null
                : GetGroupSystemMessage(chat, currentParticipant),
            CurrentUserIsMuted = currentParticipant?.IsMuted ?? false
        };
    }

    [HttpGet("users/{userId:guid}/presence")]
    public async Task<IActionResult> GetUserPresence(Guid userId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var lastSeenAtUtc = ChatHub.GetUserLastSeenUtc(userId);

        if (!lastSeenAtUtc.HasValue)
        {
            lastSeenAtUtc = await _context.Users
                .Where(x => x.Id == userId)
                .Select(x => x.LastSeenAtUtc)
                .FirstOrDefaultAsync();
        }

        return Ok(new
        {
            userId,
            isOnline = ChatHub.IsUserOnline(userId),
            lastSeenAtUtc
        });
    }

    [HttpGet]
    public async Task<IActionResult> GetChats()
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var currentUser = await _userManager.FindByIdAsync(currentUserId.Value.ToString());
        if (currentUser == null)
            return NotFound(new { message = "Пользователь не найден." });

        var hiddenMessageIds = await _context.HiddenChatMessages
            .Where(x => x.UserId == currentUserId.Value)
            .Select(x => x.MessageId)
            .ToListAsync();

        var groupChatIds = await _context.ChatParticipants
            .Where(x => x.UserId == currentUserId.Value && x.Status != ChatParticipantStatus.Left)
            .Select(x => x.ChatId)
            .ToListAsync();

        var privateChatStates = await _context.PrivateChatUserStates
            .Where(x => x.UserId == currentUserId.Value)
            .ToDictionaryAsync(x => x.ChatId, x => x.ClearedAt);

        var privateChatMutedStates = await _context.PrivateChatUserStates
            .Where(x => x.UserId == currentUserId.Value)
            .ToDictionaryAsync(x => x.ChatId, x => x.IsMuted);

        var chatReadStates = await _context.ChatReadStates
            .Where(x => x.UserId == currentUserId.Value)
            .ToDictionaryAsync(x => x.ChatId, x => x.LastReadAt);

        var chats = await _context.Chats
            .Where(x =>
                (x.Type == ChatType.Regional && x.Region == currentUser.Region)
                || (x.Type == ChatType.Private &&
                    (x.FirstUserId == currentUserId.Value || x.SecondUserId == currentUserId.Value))
                || (x.Type == ChatType.Group && groupChatIds.Contains(x.Id))
            )
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

        var blockedPrivateChatUserIds = await _context.UserBlocks
            .Where(x => x.BlockerUserId == currentUserId.Value || x.BlockedUserId == currentUserId.Value)
            .Select(x => x.BlockerUserId == currentUserId.Value ? x.BlockedUserId : x.BlockerUserId)
            .ToListAsync();

        var result = new List<ChatResponse>();

        foreach (var chat in chats)
        {
            if (chat.Type == ChatType.Private)
            {
                var otherPrivateUserId = chat.FirstUserId == currentUserId.Value
                    ? chat.SecondUserId
                    : chat.FirstUserId;

                if (otherPrivateUserId.HasValue && blockedPrivateChatUserIds.Contains(otherPrivateUserId.Value))
                    continue;
            }

            var chatName = chat.Name;
            Guid? targetUserId = null;
            string? targetUserAvatarUrl = null;
            var isTargetUserBlocked = false;
            string? targetUserBlockedText = null;
            var isMuted = false;

            DateTime? clearedAt = null;
            if (chat.Type == ChatType.Private && privateChatStates.TryGetValue(chat.Id, out var stateClearedAt))
            {
                clearedAt = stateClearedAt;
            }

            if (chat.Type == ChatType.Private && privateChatMutedStates.TryGetValue(chat.Id, out var privateIsMuted))
            {
                isMuted = privateIsMuted;
            }

            DateTime? lastReadAt = null;
            if (chatReadStates.TryGetValue(chat.Id, out var storedLastReadAt))
            {
                lastReadAt = storedLastReadAt;
            }

            if (chat.Type == ChatType.Private)
            {
                var otherUserId = chat.FirstUserId == currentUserId.Value
                    ? chat.SecondUserId
                    : chat.FirstUserId;

                if (otherUserId.HasValue)
                {
                    var otherUser = await _userManager.FindByIdAsync(otherUserId.Value.ToString());

                    if (otherUser != null)
                    {
                        targetUserId = otherUser.Id;
                        isTargetUserBlocked = otherUser.IsBlocked;
                        targetUserBlockedText = otherUser.IsBlocked ? "Аккаунт пользователя заблокирован" : null;
                        targetUserAvatarUrl = otherUser.IsBlocked ? null : otherUser.AvatarUrl;
                        chatName = GetDisplayName(otherUser);
                    }
                    else
                    {
                        chatName = "Личный чат";
                    }
                }
                else
                {
                    chatName = "Личный чат";
                }
            }
            else if (chat.Type == ChatType.Group)
            {
                targetUserAvatarUrl = chat.AvatarUrl;
            }

            var lastMessageQuery = _context.ChatMessages
                .Where(x => x.ChatId == chat.Id && !hiddenMessageIds.Contains(x.Id));

            if (chat.Type == ChatType.Private && clearedAt.HasValue)
            {
                lastMessageQuery = lastMessageQuery.Where(x => x.SentAt > clearedAt.Value);
            }

            var lastMessage = await lastMessageQuery
                .OrderByDescending(x => x.SentAt)
                .Include(x => x.User)
                .Include(x => x.Attachments)
                .Include(x => x.SharedFishingEntry)
                    .ThenInclude(x => x.User)
                .Include(x => x.SharedFishingEntry)
                    .ThenInclude(x => x.Media)
                .FirstOrDefaultAsync();

            if (chat.Type == ChatType.Private && clearedAt.HasValue && lastMessage == null)
            {
                continue;
            }

            if (chat.Type == ChatType.Group)
            {
                var currentParticipant = await _context.ChatParticipants
                    .FirstOrDefaultAsync(x => x.ChatId == chat.Id && x.UserId == currentUserId.Value);

                if (currentParticipant != null)
                {
                    isMuted = currentParticipant.IsMuted;

                    if (chat.IsDeletedByOwner)
                    {
                        result.Add(new ChatResponse
                        {
                            Id = chat.Id,
                            Name = chatName,
                            Type = chat.Type.ToString(),
                            Region = chat.Region,
                            CreatedAt = chat.CreatedAt,
                            TargetUserId = targetUserId,
                            TargetUserAvatarUrl = targetUserAvatarUrl,
                            LastMessageText = "Чат удалён владельцем",
                            LastMessageSentAt = chat.DeletedByOwnerAt ?? chat.CreatedAt,
                            LastMessageUserName = null,
                            UnreadCount = 0,
                            HasUnread = false,
                            IsMuted = isMuted,
                        });

                        continue;
                    }

                    if (currentParticipant.Status == ChatParticipantStatus.Removed)
                    {
                        result.Add(new ChatResponse
                        {
                            Id = chat.Id,
                            Name = chatName,
                            Type = chat.Type.ToString(),
                            Region = chat.Region,
                            CreatedAt = chat.CreatedAt,
                            TargetUserId = targetUserId,
                            TargetUserAvatarUrl = targetUserAvatarUrl,
                            LastMessageText = "Вы были исключены из чата",
                            LastMessageSentAt = currentParticipant.StatusChangedAt ?? chat.CreatedAt,
                            LastMessageUserName = null,
                            UnreadCount = 0,
                            HasUnread = false,
                            IsMuted = isMuted,
                        });

                        continue;
                    }

                    if (currentParticipant.Status == ChatParticipantStatus.Left)
                    {
                        result.Add(new ChatResponse
                        {
                            Id = chat.Id,
                            Name = chatName,
                            Type = chat.Type.ToString(),
                            Region = chat.Region,
                            CreatedAt = chat.CreatedAt,
                            TargetUserId = targetUserId,
                            TargetUserAvatarUrl = targetUserAvatarUrl,
                            LastMessageText = "Вы вышли из чата",
                            LastMessageSentAt = currentParticipant.StatusChangedAt ?? chat.CreatedAt,
                            LastMessageUserName = null,
                            UnreadCount = 0,
                            HasUnread = false,
                            IsMuted = isMuted,
                        });

                        continue;
                    }
                }
            }

            var unreadQuery = _context.ChatMessages
                .Where(x =>
                    x.ChatId == chat.Id &&
                    x.UserId != currentUserId.Value &&
                    !hiddenMessageIds.Contains(x.Id));

            if (chat.Type == ChatType.Private && clearedAt.HasValue)
            {
                unreadQuery = unreadQuery.Where(x => x.SentAt > clearedAt.Value);
            }

            if (lastReadAt.HasValue)
            {
                unreadQuery = unreadQuery.Where(x => x.SentAt > lastReadAt.Value);
            }

            var unreadCount = await unreadQuery.CountAsync();

            string? lastMessageText = lastMessage == null
                ? null
                : (lastMessage.IsDeletedForAll
                    ? "Сообщение удалено"
                    : lastMessage.SharedFishingEntryId.HasValue
                        ? "🎣 Запись из ленты"
                        : !string.IsNullOrWhiteSpace(lastMessage.Text)
                            ? lastMessage.Text
                            : lastMessage.Attachments.Count == 1 && lastMessage.Attachments.First().IsVoiceMessage
                                ? "Голосовое сообщение"
                                : lastMessage.Attachments.Count == 1
                                    ? "Вложение"
                                    : lastMessage.Attachments.Count > 1
                                    ? $"Вложения: {lastMessage.Attachments.Count}"
                                    : null);

            DateTime? lastMessageSentAt = lastMessage?.SentAt;
            string? lastMessageUserName = lastMessage?.User == null ? null : GetDisplayName(lastMessage.User);

            if (chat.Type == ChatType.Group && lastMessage == null)
            {
                var currentParticipant = await _context.ChatParticipants
                    .FirstOrDefaultAsync(x => x.ChatId == chat.Id && x.UserId == currentUserId.Value);

                if (currentParticipant != null && currentParticipant.Status == ChatParticipantStatus.Active)
                {
                    lastMessageSentAt = currentParticipant.JoinedAt;
                    lastMessageUserName = null;

                    if (chat.CreatedByUserId == currentUserId.Value)
                    {
                        lastMessageText = "Групповой чат создан";
                    }
                    else
                    {
                        var creator = chat.CreatedByUserId.HasValue
                            ? await _context.Users.FirstOrDefaultAsync(x => x.Id == chat.CreatedByUserId.Value)
                            : null;

                        lastMessageText = creator == null
                            ? "Вы были добавлены в групповой чат"
                            : $"Вы были добавлены пользователем {GetDisplayName(creator)}";
                    }
                }
            }

            if (chat.Type == ChatType.Private && isTargetUserBlocked)
            {
                lastMessageText = "Аккаунт пользователя заблокирован";
                lastMessageUserName = null;
                unreadCount = 0;
            }

            result.Add(new ChatResponse
            {
                Id = chat.Id,
                Name = chatName,
                Type = chat.Type.ToString(),
                Region = chat.Region,
                CreatedAt = chat.CreatedAt,
                TargetUserId = targetUserId,
                TargetUserAvatarUrl = targetUserAvatarUrl,
                IsTargetUserBlocked = isTargetUserBlocked,
                TargetUserBlockedText = targetUserBlockedText,
                LastMessageText = lastMessageText,
                LastMessageSentAt = lastMessageSentAt,
                LastMessageUserName = lastMessageUserName,
                UnreadCount = unreadCount,
                HasUnread = unreadCount > 0,
                IsMuted = isMuted,
            });
        }

        return Ok(result);
    }

    [HttpPatch("{chatId:guid}/notifications")]
    public async Task<IActionResult> UpdateChatNotificationSettings(Guid chatId, UpdateChatNotificationSettingsRequest request)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats.FirstOrDefaultAsync(x => x.Id == chatId);
        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type == ChatType.Group)
        {
            var participant = await _context.ChatParticipants
                .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == currentUserId.Value);

            if (participant == null || participant.Status != ChatParticipantStatus.Active)
                return Forbid();

            participant.IsMuted = request.IsMuted;
            await _context.SaveChangesAsync();

            return Ok(new { chatId, isMuted = participant.IsMuted });
        }

        if (chat.Type == ChatType.Private)
        {
            var hasAccess = chat.FirstUserId == currentUserId.Value || chat.SecondUserId == currentUserId.Value;
            if (!hasAccess)
                return Forbid();

            var state = await _context.PrivateChatUserStates
                .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == currentUserId.Value);

            if (state == null)
            {
                state = new PrivateChatUserState
                {
                    Id = Guid.NewGuid(),
                    ChatId = chatId,
                    UserId = currentUserId.Value,
                    ClearedAt = null,
                    IsMuted = request.IsMuted
                };

                _context.PrivateChatUserStates.Add(state);
            }
            else
            {
                state.IsMuted = request.IsMuted;
            }

            await _context.SaveChangesAsync();

            return Ok(new { chatId, isMuted = state.IsMuted });
        }

        return BadRequest(new { message = "Настройки уведомлений доступны только для личных и групповых чатов." });
    }

    [HttpGet("{chatId:guid}/messages")]
    public async Task<IActionResult> GetMessages(Guid chatId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats.FirstOrDefaultAsync(x => x.Id == chatId);
        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        var hasAccess = await HasAccessToChatAsync(chat, currentUserId.Value);
        if (!hasAccess)
            return Forbid();

        var hiddenMessageIds = await _context.HiddenChatMessages
            .Where(x => x.UserId == currentUserId.Value)
            .Select(x => x.MessageId)
            .ToListAsync();

        DateTime? clearedAt = null;

        if (chat.Type == ChatType.Private)
        {
            clearedAt = await _context.PrivateChatUserStates
                .Where(x => x.ChatId == chatId && x.UserId == currentUserId.Value)
                .Select(x => x.ClearedAt)
                .FirstOrDefaultAsync();
        }

        var messagesQuery = _context.ChatMessages
            .Where(x => x.ChatId == chatId && !hiddenMessageIds.Contains(x.Id));

        if (chat.Type == ChatType.Private && clearedAt.HasValue)
        {
            messagesQuery = messagesQuery.Where(x => x.SentAt > clearedAt.Value);
        }

        var messageEntities = await messagesQuery
            .OrderBy(x => x.SentAt)
            .Include(x => x.User)
            .Include(x => x.ReplyToMessage)
                .ThenInclude(x => x.User)
            .Include(x => x.SharedFishingEntry)
                .ThenInclude(x => x.User)
            .Include(x => x.SharedFishingEntry)
                .ThenInclude(x => x.Media)
            .Include(x => x.Attachments)
            .ToListAsync();

        var incomingVoiceAttachmentIds = messageEntities
            .SelectMany(x => x.Attachments
                .Where(a => a.IsVoiceMessage && x.UserId != currentUserId.Value)
                .Select(a => a.Id))
            .ToList();

        var listenedIncomingVoiceAttachmentIdList = incomingVoiceAttachmentIds.Count == 0
            ? new List<Guid>()
            : await _context.VoiceMessageListenStates
                .AsNoTracking()
                .Where(x =>
                    x.UserId == currentUserId.Value &&
                    incomingVoiceAttachmentIds.Contains(x.ChatMessageAttachmentId))
                .Select(x => x.ChatMessageAttachmentId)
                .ToListAsync();

        var listenedIncomingVoiceAttachmentIds = listenedIncomingVoiceAttachmentIdList.ToHashSet();

        var ownVoiceAttachmentIds = messageEntities
            .SelectMany(x => x.Attachments
                .Where(a => a.IsVoiceMessage && x.UserId == currentUserId.Value)
                .Select(a => a.Id))
            .ToList();

        var voiceListenTargetUserIds = await GetVoiceListenTargetUserIdsAsync(chat, currentUserId.Value);
        var voiceListenTargetCount = voiceListenTargetUserIds.Count;

        var ownVoiceListenCounts = new Dictionary<Guid, int>();

        if (ownVoiceAttachmentIds.Count > 0 && voiceListenTargetUserIds.Count > 0)
        {
            var ownVoiceListenRows = await _context.VoiceMessageListenStates
                .AsNoTracking()
                .Where(x =>
                    ownVoiceAttachmentIds.Contains(x.ChatMessageAttachmentId) &&
                    voiceListenTargetUserIds.Contains(x.UserId))
                .Select(x => new { x.ChatMessageAttachmentId, x.UserId })
                .ToListAsync();

            ownVoiceListenCounts = ownVoiceListenRows
                .GroupBy(x => x.ChatMessageAttachmentId)
                .ToDictionary(
                    x => x.Key,
                    x => x.Select(item => item.UserId).Distinct().Count());
        }

        var messages = messageEntities
            .Select(x => new ChatMessageResponse
            {
                Id = x.Id,
                ChatId = x.ChatId,
                UserId = x.UserId,
                UserName = GetDisplayName(x.User),
                UserAvatarUrl = x.User.AvatarUrl,
                Text = x.IsDeletedForAll ? "Сообщение удалено" : x.Text,
                SentAt = x.SentAt,
                ReplyToMessageId = x.ReplyToMessageId,
                ReplyToUserName = x.ReplyToMessage?.User != null ? GetDisplayName(x.ReplyToMessage.User) : null,
                ReplyToText = x.ReplyToMessage != null
                    ? (x.ReplyToMessage.IsDeletedForAll ? "Сообщение удалено" : x.ReplyToMessage.SharedFishingEntryId.HasValue ? "Запись из ленты" : x.ReplyToMessage.Text)
                    : null,
                SharedFishingEntryId = x.SharedFishingEntryId,
                SharedFishingEntry = MapSharedFishingEntry(x.SharedFishingEntry),
                IsDeleted = x.IsDeleted,
                IsDeletedForAll = x.IsDeletedForAll,
                IsForwarded = x.IsForwarded,
                ForwardedFromUserId = x.ForwardedFromUserId,
                ForwardedFromUserName = x.ForwardedFromUserName,
                IsReadByOthers = false,
                Attachments = x.Attachments
                    .Select(a =>
                    {
                        var isOwnVoice = a.IsVoiceMessage && x.UserId == currentUserId.Value;
                        var listenedByOthersCount = isOwnVoice && ownVoiceListenCounts.TryGetValue(a.Id, out var storedListenedCount)
                            ? Math.Min(storedListenedCount, voiceListenTargetCount)
                            : 0;

                        return new ChatMessageAttachmentResponse
                        {
                            Id = a.Id,
                            FileName = a.FileName,
                            FileUrl = a.FileUrl,
                            ContentType = a.ContentType,
                            Size = a.Size,
                            AttachmentType = a.AttachmentType,
                            IsVoiceMessage = a.IsVoiceMessage,
                            VoiceDurationMs = a.VoiceDurationMs,
                            VoiceWaveform = a.VoiceWaveform,
                            IsVoiceListenedByCurrentUser = a.IsVoiceMessage && x.UserId != currentUserId.Value && listenedIncomingVoiceAttachmentIds.Contains(a.Id),
                            IsVoiceListenedByOthers = isOwnVoice && (voiceListenTargetCount == 0 || listenedByOthersCount >= voiceListenTargetCount),
                            VoiceListenedByOthersCount = listenedByOthersCount,
                            VoiceListenTargetCount = isOwnVoice ? voiceListenTargetCount : 0
                        };
                    })
                    .ToList()
            })
            .ToList();

        var readByOthersMap = await GetReadByOthersMapAsync(chat, currentUserId.Value, messages);
        foreach (var message in messages)
        {
            if (readByOthersMap.TryGetValue(message.Id, out var isReadByOthers))
            {
                message.IsReadByOthers = isReadByOthers;
            }
        }

        return Ok(messages);
    }


    [HttpPost("attachments/{attachmentId:guid}/voice/listened")]
    public async Task<IActionResult> MarkVoiceMessageAsListened(Guid attachmentId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var attachment = await _context.ChatMessageAttachments
            .Include(x => x.ChatMessage)
                .ThenInclude(x => x.Chat)
            .FirstOrDefaultAsync(x => x.Id == attachmentId);

        if (attachment == null)
            return NotFound(new { message = "Голосовое сообщение не найдено." });

        if (!attachment.IsVoiceMessage)
            return BadRequest(new { message = "Вложение не является голосовым сообщением." });

        var chat = attachment.ChatMessage.Chat;
        var hasAccess = await HasAccessToChatAsync(chat, currentUserId.Value);

        if (!hasAccess)
            return Forbid();

        if (attachment.ChatMessage.UserId == currentUserId.Value)
        {
            return Ok(new
            {
                attachmentId,
                isVoiceListenedByCurrentUser = true,
                listenedAtUtc = (DateTime?)null
            });
        }

        var existingState = await _context.VoiceMessageListenStates
            .FirstOrDefaultAsync(x =>
                x.ChatMessageAttachmentId == attachmentId &&
                x.UserId == currentUserId.Value);

        if (existingState == null)
        {
            existingState = new VoiceMessageListenState
            {
                Id = Guid.NewGuid(),
                ChatMessageAttachmentId = attachmentId,
                UserId = currentUserId.Value,
                ListenedAtUtc = DateTime.UtcNow
            };

            _context.VoiceMessageListenStates.Add(existingState);
            await _context.SaveChangesAsync();
        }

        var voiceListenTargetUserIds = await GetVoiceListenTargetUserIdsAsync(chat, attachment.ChatMessage.UserId);
        var listenedUserIdList = voiceListenTargetUserIds.Count == 0
            ? new List<Guid>()
            : await _context.VoiceMessageListenStates
                .AsNoTracking()
                .Where(x =>
                    x.ChatMessageAttachmentId == attachmentId &&
                    voiceListenTargetUserIds.Contains(x.UserId))
                .Select(x => x.UserId)
                .ToListAsync();

        var voiceListenedByOthersCount = listenedUserIdList.Distinct().Count();
        var voiceListenTargetCount = voiceListenTargetUserIds.Count;
        var isVoiceListenedByOthers = voiceListenTargetCount == 0 || voiceListenedByOthersCount >= voiceListenTargetCount;

        var payload = new
        {
            chatId = chat.Id,
            messageId = attachment.ChatMessageId,
            attachmentId,
            userId = currentUserId.Value,
            isVoiceListenedByCurrentUser = true,
            isVoiceListenedByOthers,
            voiceListenedByOthersCount,
            voiceListenTargetCount,
            listenedAtUtc = existingState.ListenedAtUtc
        };

        await _chatHub.Clients
            .Group($"chat_{chat.Id}")
            .SendAsync("ChatVoiceMessageListened", payload);

        return Ok(payload);
    }

    [HttpPost("{chatId:guid}/read-until")]
    public async Task<IActionResult> MarkChatAsReadUntil(Guid chatId, MarkChatReadUntilRequest request)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (request.MessageId == Guid.Empty)
            return BadRequest(new { message = "Не указано сообщение для отметки прочитанным." });

        var chat = await _context.Chats.FirstOrDefaultAsync(x => x.Id == chatId);
        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        var hasAccess = await HasAccessToChatAsync(chat, currentUserId.Value);
        if (!hasAccess)
            return Forbid();

        var message = await _context.ChatMessages
            .AsNoTracking()
            .Where(x => x.ChatId == chatId && x.Id == request.MessageId)
            .Select(x => new { x.Id, x.SentAt })
            .FirstOrDefaultAsync();

        if (message == null)
            return NotFound(new { message = "Сообщение не найдено." });

        var readAt = message.SentAt.Kind == DateTimeKind.Utc
            ? message.SentAt
            : DateTime.SpecifyKind(message.SentAt, DateTimeKind.Utc);
        var now = DateTime.UtcNow;

        var state = await _context.ChatReadStates
            .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == currentUserId.Value);

        var shouldSave = false;

        if (state == null)
        {
            state = new ChatReadState
            {
                Id = Guid.NewGuid(),
                ChatId = chatId,
                UserId = currentUserId.Value,
                LastReadAt = readAt,
                UpdatedAt = now
            };

            _context.ChatReadStates.Add(state);
            shouldSave = true;
        }
        else if (!state.LastReadAt.HasValue || state.LastReadAt.Value < readAt)
        {
            state.LastReadAt = readAt;
            state.UpdatedAt = now;
            shouldSave = true;
        }
        else
        {
            readAt = state.LastReadAt.Value;
        }

        if (shouldSave)
        {
            await _context.SaveChangesAsync();

            await _chatHub.Clients
                .Group($"chat_{chatId}")
                .SendAsync("ChatReadStateChanged", new
                {
                    chatId,
                    userId = currentUserId.Value,
                    readAt
                });
        }

        return Ok(new
        {
            chatId,
            readAt
        });
    }

    [HttpPost("{chatId:guid}/read")]
    public async Task<IActionResult> MarkChatAsRead(Guid chatId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats.FirstOrDefaultAsync(x => x.Id == chatId);
        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        var hasAccess = await HasAccessToChatAsync(chat, currentUserId.Value);
        if (!hasAccess)
            return Forbid();

        var now = DateTime.UtcNow;

        var state = await _context.ChatReadStates
            .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == currentUserId.Value);

        if (state == null)
        {
            state = new ChatReadState
            {
                Id = Guid.NewGuid(),
                ChatId = chatId,
                UserId = currentUserId.Value,
                LastReadAt = now,
                UpdatedAt = now
            };

            _context.ChatReadStates.Add(state);
        }
        else
        {
            state.LastReadAt = now;
            state.UpdatedAt = now;
        }

        await _context.SaveChangesAsync();

        await _chatHub.Clients
            .Group($"chat_{chatId}")
            .SendAsync("ChatReadStateChanged", new
            {
                chatId,
                userId = currentUserId.Value,
                readAt = now
            });

        return Ok(new
        {
            chatId,
            readAt = now
        });
    }

    [HttpPost("{chatId:guid}/messages")]
    public async Task<IActionResult> SendMessage(Guid chatId, CreateChatMessageRequest request)
    {
        var normalizedText = NormalizeMessageText(request.Text);
        var hasText = !string.IsNullOrWhiteSpace(normalizedText);
        var hasAttachments = request.Attachments != null && request.Attachments.Count > 0;
        var hasSharedFishingEntry = request.SharedFishingEntryId.HasValue;

        if (!hasText && !hasAttachments && !hasSharedFishingEntry)
            return BadRequest(new { message = "Сообщение должно содержать текст, вложение или запись из ленты." });

        var attachmentValidationError = ValidateChatAttachmentRequests(request.Attachments);
        if (attachmentValidationError != null)
            return attachmentValidationError;

        var userId = GetCurrentUserId();

        if (userId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats.FirstOrDefaultAsync(x => x.Id == chatId);
        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        var hasAccess = await HasAccessToChatAsync(chat, userId.Value);
        if (!hasAccess)
            return Forbid();

        if (chat.Type == ChatType.Private)
        {
            var otherUserId = chat.FirstUserId == userId.Value
                ? chat.SecondUserId
                : chat.FirstUserId;

            if (otherUserId.HasValue && await IsPrivateCommunicationBlockedAsync(userId.Value, otherUserId.Value))
                return BadRequest(new { message = "Личные сообщения недоступны." });

            if (otherUserId.HasValue && await _context.Users.AnyAsync(x => x.Id == otherUserId.Value && x.IsBlocked))
                return BadRequest(new { message = "Аккаунт пользователя заблокирован. Отправка сообщений недоступна." });
        }

        if (chat.Type == ChatType.Group)
        {
            var participant = await _context.ChatParticipants
                .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == userId.Value);

            if (participant == null || !CanSendToGroupChat(chat, participant))
            {
                return BadRequest(new
                {
                    message = chat.IsDeletedByOwner
                        ? "Чат удалён владельцем. Отправка сообщений недоступна."
                        : "Вы не можете отправлять сообщения в этот чат."
                });
            }
        }

        var user = await _userManager.FindByIdAsync(userId.Value.ToString());
        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        ChatMessage? replyToMessage = null;

        if (request.ReplyToMessageId.HasValue)
        {
            replyToMessage = await _context.ChatMessages
                .Include(x => x.User)
                .FirstOrDefaultAsync(x => x.Id == request.ReplyToMessageId.Value && x.ChatId == chatId);

            if (replyToMessage == null)
                return BadRequest(new { message = "Сообщение для ответа не найдено." });
        }

        FishingEntry? sharedFishingEntry = null;

        if (request.SharedFishingEntryId.HasValue)
        {
            sharedFishingEntry = await _context.FishingEntries
                .Include(x => x.User)
                .Include(x => x.Media)
                .FirstOrDefaultAsync(x =>
                    x.Id == request.SharedFishingEntryId.Value &&
                    (
                        (x.Visibility == FishingEntryVisibility.PublicProfile && x.IsPublishedToFeed) ||
                        x.UserId == userId.Value
                    ));

            if (sharedFishingEntry == null)
                return BadRequest(new { message = "Запись не найдена или недоступна для отправки." });
        }

        var message = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ChatId = chatId,
            UserId = userId.Value,
            Text = hasText ? normalizedText : string.Empty,
            SentAt = DateTime.UtcNow,
            IsDeleted = false,
            IsDeletedForAll = false,
            DeletedAt = null,
            ReplyToMessageId = request.ReplyToMessageId,
            SharedFishingEntryId = request.SharedFishingEntryId,
            SharedFishingEntry = sharedFishingEntry
        };

        _context.ChatMessages.Add(message);

        var savedAttachments = new List<ChatMessageAttachment>();

        if (request.Attachments != null && request.Attachments.Count > 0)
        {
            foreach (var attachment in request.Attachments)
            {
                var savedAttachment = new ChatMessageAttachment
                {
                    Id = Guid.NewGuid(),
                    ChatMessageId = message.Id,
                    FileName = NormalizeFileNameForDisplay(attachment.FileName),
                    StoredFileName = Path.GetFileName(attachment.StoredFileName ?? string.Empty),
                    FileUrl = attachment.FileUrl.Trim(),
                    ContentType = NormalizeContentTypeHeader(attachment.ContentType),
                    Size = attachment.Size,
                    AttachmentType = attachment.IsVoiceMessage ? "Audio" : attachment.AttachmentType,
                    IsVoiceMessage = attachment.IsVoiceMessage,
                    VoiceDurationMs = attachment.IsVoiceMessage ? NormalizeVoiceDurationMs(attachment.VoiceDurationMs) : null,
                    VoiceWaveform = attachment.IsVoiceMessage ? NormalizeVoiceWaveform(attachment.VoiceWaveform) : null,
                    CreatedAt = DateTime.UtcNow
                };

                savedAttachments.Add(savedAttachment);
            }

            _context.ChatMessageAttachments.AddRange(savedAttachments);
        }

        await _context.SaveChangesAsync();

        var response = BuildChatMessageResponse(message, user, replyToMessage, savedAttachments);

        var voiceListenTargetUserIds = await GetVoiceListenTargetUserIdsAsync(chat, userId.Value);
        var voiceListenTargetCount = voiceListenTargetUserIds.Count;

        foreach (var attachment in response.Attachments.Where(x => x.IsVoiceMessage))
        {
            attachment.IsVoiceListenedByCurrentUser = false;
            attachment.VoiceListenedByOthersCount = 0;
            attachment.VoiceListenTargetCount = voiceListenTargetCount;
            attachment.IsVoiceListenedByOthers = voiceListenTargetCount == 0;
        }

        await _chatHub.Clients
            .Group($"chat_{chatId}")
            .SendAsync("ReceiveMessage", response);

        var notificationRecipients = await GetChatNotificationRecipientsAsync(chatId, userId.Value);
        var messagePreview = BuildMessageNotificationPreview(response);
        var notificationChatName = chat.Type == ChatType.Group
            ? chat.Name
            : "Личное сообщение";

        foreach (var recipient in notificationRecipients)
        {
            await _chatHub.Clients
                .Group($"user_{recipient.UserId}")
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId,
                    messageId = response.Id,
                    senderUserId = userId,
                    senderName = response.UserName,
                    chatName = notificationChatName,
                    messagePreview,
                    isMuted = recipient.IsMuted,
                    updatedAtUtc = DateTime.UtcNow
                });
        }

        return Ok(response);
    }


    [HttpPost("messages/{messageId:guid}/forward")]
    public async Task<IActionResult> ForwardMessage(Guid messageId, ForwardChatMessageRequest request)
    {
        request.MessageIds = new List<Guid> { messageId };
        return await ForwardMessages(request);
    }

    [HttpPost("messages/forward")]
    public async Task<IActionResult> ForwardMessages(ForwardChatMessageRequest request)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var targetChatIds = (request.TargetChatIds ?? new List<Guid>())
            .Where(x => x != Guid.Empty)
            .Distinct()
            .Take(20)
            .ToList();

        if (targetChatIds.Count == 0)
            return BadRequest(new { message = "Выберите чат для пересылки." });

        var sourceMessageIds = (request.MessageIds ?? new List<Guid>())
            .Where(x => x != Guid.Empty)
            .Distinct()
            .Take(50)
            .ToList();

        if (sourceMessageIds.Count == 0)
            return BadRequest(new { message = "Выберите сообщения для пересылки." });

        var sourceMessages = await _context.ChatMessages
            .Include(x => x.Chat)
            .Include(x => x.User)
            .Include(x => x.Attachments)
            .Include(x => x.SharedFishingEntry)
                .ThenInclude(x => x!.User)
            .Include(x => x.SharedFishingEntry)
                .ThenInclude(x => x!.Media)
            .Where(x => sourceMessageIds.Contains(x.Id))
            .ToListAsync();

        if (sourceMessages.Count != sourceMessageIds.Count)
            return NotFound(new { message = "Одно из выбранных сообщений не найдено." });

        var sourceMessagesById = sourceMessages.ToDictionary(x => x.Id);
        sourceMessages = sourceMessageIds
            .Select(id => sourceMessagesById[id])
            .OrderBy(x => x.SentAt)
            .ThenBy(x => x.Id)
            .ToList();

        foreach (var sourceMessage in sourceMessages)
        {
            if (sourceMessage.IsDeletedForAll)
                return BadRequest(new { message = "Удалённые сообщения нельзя переслать." });

            var hasAccessToSourceChat = await HasAccessToChatAsync(sourceMessage.Chat, currentUserId.Value);
            if (!hasAccessToSourceChat)
                return Forbid();

            var isHiddenForCurrentUser = await _context.HiddenChatMessages
                .AnyAsync(x => x.MessageId == sourceMessage.Id && x.UserId == currentUserId.Value);

            if (isHiddenForCurrentUser)
                return NotFound(new { message = "Одно из выбранных сообщений не найдено." });

            var hasText = !string.IsNullOrWhiteSpace(sourceMessage.Text);
            var hasAttachments = sourceMessage.Attachments.Count > 0;
            var hasSharedFishingEntry = sourceMessage.SharedFishingEntryId.HasValue;

            if (!hasText && !hasAttachments && !hasSharedFishingEntry)
                return BadRequest(new { message = "В одном из выбранных сообщений нет данных для пересылки." });

            if (sourceMessage.SharedFishingEntryId.HasValue)
            {
                var sharedEntry = sourceMessage.SharedFishingEntry;
                var canForwardEntry =
                    sharedEntry != null &&
                    (
                        (sharedEntry.Visibility == FishingEntryVisibility.PublicProfile && sharedEntry.IsPublishedToFeed) ||
                        sharedEntry.UserId == currentUserId.Value
                    );

                if (!canForwardEntry)
                    return BadRequest(new { message = "Одну из выбранных записей нельзя переслать в другой чат." });
            }
        }

        var currentUser = await _userManager.FindByIdAsync(currentUserId.Value.ToString());
        if (currentUser == null)
            return NotFound(new { message = "Пользователь не найден." });

        var targetChats = await _context.Chats
            .Where(x => targetChatIds.Contains(x.Id))
            .ToListAsync();

        if (targetChats.Count != targetChatIds.Count)
            return BadRequest(new { message = "Один из выбранных чатов не найден." });

        var targetChatsById = targetChats.ToDictionary(x => x.Id);

        foreach (var targetChatId in targetChatIds)
        {
            var targetChat = targetChatsById[targetChatId];
            var hasAccessToTargetChat = await HasAccessToChatAsync(targetChat, currentUserId.Value);

            if (!hasAccessToTargetChat)
                return Forbid();

            if (targetChat.Type == ChatType.Private)
            {
                var otherUserId = targetChat.FirstUserId == currentUserId.Value
                    ? targetChat.SecondUserId
                    : targetChat.FirstUserId;

                if (otherUserId.HasValue && await IsPrivateCommunicationBlockedAsync(currentUserId.Value, otherUserId.Value))
                    return BadRequest(new { message = "В один из выбранных личных чатов нельзя отправлять сообщения." });

                if (otherUserId.HasValue && await _context.Users.AnyAsync(x => x.Id == otherUserId.Value && x.IsBlocked))
                    return BadRequest(new { message = "В один из выбранных чатов нельзя отправлять сообщения: аккаунт пользователя заблокирован." });
            }

            if (targetChat.Type == ChatType.Group)
            {
                var participant = await _context.ChatParticipants
                    .FirstOrDefaultAsync(x => x.ChatId == targetChatId && x.UserId == currentUserId.Value);

                if (participant == null || !CanSendToGroupChat(targetChat, participant))
                {
                    return BadRequest(new
                    {
                        message = targetChat.IsDeletedByOwner
                            ? "Один из выбранных чатов удалён владельцем."
                            : "В один из выбранных чатов нельзя отправлять сообщения."
                    });
                }
            }
        }

        var responses = new List<ChatMessageResponse>();
        var now = DateTime.UtcNow;
        var sequence = 0;

        foreach (var targetChatId in targetChatIds)
        {
            var targetChat = targetChatsById[targetChatId];
            var notificationRecipients = await GetChatNotificationRecipientsAsync(targetChatId, currentUserId.Value);
            var notificationChatName = targetChat.Type == ChatType.Group
                ? targetChat.Name
                : "Личное сообщение";
            var voiceListenTargetUserIds = await GetVoiceListenTargetUserIdsAsync(targetChat, currentUserId.Value);
            var voiceListenTargetCount = voiceListenTargetUserIds.Count;

            foreach (var sourceMessage in sourceMessages)
            {
                var forwardedFromUserId = sourceMessage.IsForwarded
                    ? sourceMessage.ForwardedFromUserId ?? sourceMessage.UserId
                    : sourceMessage.UserId;

                var forwardedFromUserName = !string.IsNullOrWhiteSpace(sourceMessage.ForwardedFromUserName)
                    ? sourceMessage.ForwardedFromUserName
                    : GetDisplayName(sourceMessage.User);

                var forwardedMessage = new ChatMessage
                {
                    Id = Guid.NewGuid(),
                    ChatId = targetChatId,
                    UserId = currentUserId.Value,
                    Text = !string.IsNullOrWhiteSpace(sourceMessage.Text) ? sourceMessage.Text : string.Empty,
                    SentAt = now.AddMilliseconds(sequence++),
                    IsDeleted = false,
                    IsDeletedForAll = false,
                    DeletedAt = null,
                    ReplyToMessageId = null,
                    SharedFishingEntryId = sourceMessage.SharedFishingEntryId,
                    SharedFishingEntry = sourceMessage.SharedFishingEntry,
                    IsForwarded = true,
                    ForwardedFromUserId = forwardedFromUserId,
                    ForwardedFromUserName = forwardedFromUserName
                };

                _context.ChatMessages.Add(forwardedMessage);

                var forwardedAttachments = sourceMessage.Attachments
                    .OrderBy(x => x.CreatedAt)
                    .Select(sourceAttachment => new ChatMessageAttachment
                    {
                        Id = Guid.NewGuid(),
                        ChatMessageId = forwardedMessage.Id,
                        FileName = sourceAttachment.FileName,
                        StoredFileName = sourceAttachment.StoredFileName,
                        FileUrl = sourceAttachment.FileUrl,
                        ContentType = sourceAttachment.ContentType,
                        Size = sourceAttachment.Size,
                        AttachmentType = sourceAttachment.AttachmentType,
                        IsVoiceMessage = sourceAttachment.IsVoiceMessage,
                        VoiceDurationMs = sourceAttachment.VoiceDurationMs,
                        VoiceWaveform = sourceAttachment.VoiceWaveform,
                        CreatedAt = forwardedMessage.SentAt
                    })
                    .ToList();

                if (forwardedAttachments.Count > 0)
                    _context.ChatMessageAttachments.AddRange(forwardedAttachments);

                await _context.SaveChangesAsync();

                var response = BuildChatMessageResponse(forwardedMessage, currentUser, null, forwardedAttachments);

                foreach (var attachment in response.Attachments.Where(x => x.IsVoiceMessage))
                {
                    attachment.IsVoiceListenedByCurrentUser = false;
                    attachment.VoiceListenedByOthersCount = 0;
                    attachment.VoiceListenTargetCount = voiceListenTargetCount;
                    attachment.IsVoiceListenedByOthers = voiceListenTargetCount == 0;
                }

                await _chatHub.Clients
                    .Group($"chat_{targetChatId}")
                    .SendAsync("ReceiveMessage", response);

                var messagePreview = BuildMessageNotificationPreview(response);

                foreach (var recipient in notificationRecipients)
                {
                    await _chatHub.Clients
                        .Group($"user_{recipient.UserId}")
                        .SendAsync("ChatNotificationChanged", new
                        {
                            chatId = targetChatId,
                            messageId = response.Id,
                            senderUserId = currentUserId,
                            senderName = response.UserName,
                            chatName = notificationChatName,
                            messagePreview,
                            isMuted = recipient.IsMuted,
                            updatedAtUtc = DateTime.UtcNow
                        });
                }

                responses.Add(response);
            }
        }

        return Ok(responses);
    }

    [HttpDelete("messages/{messageId:guid}")]
    public async Task<IActionResult> DeleteMessage(Guid messageId, [FromBody] DeleteChatMessageRequest request)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var message = await _context.ChatMessages
            .FirstOrDefaultAsync(x => x.Id == messageId);

        if (message == null)
            return NotFound(new { message = "Сообщение не найдено." });

        if (request.DeleteForAll)
        {
            var chat = await _context.Chats
                .FirstOrDefaultAsync(x => x.Id == message.ChatId);

            if (chat == null)
                return NotFound(new { message = "Чат не найден." });

            var hasAccessToChat = await HasAccessToChatAsync(chat, currentUserId.Value);
            if (!hasAccessToChat)
                return Forbid();

            var canDeleteForAll = message.UserId == currentUserId.Value;

            if (!canDeleteForAll && chat.Type == ChatType.Group)
            {
                var currentParticipant = await _context.ChatParticipants
                    .FirstOrDefaultAsync(x =>
                        x.ChatId == chat.Id &&
                        x.UserId == currentUserId.Value);

                canDeleteForAll =
                    currentParticipant != null &&
                    currentParticipant.Status == ChatParticipantStatus.Active &&
                    (currentParticipant.Role == ChatParticipantRole.Owner ||
                     currentParticipant.Role == ChatParticipantRole.Admin);
            }

            if (!canDeleteForAll)
                return Forbid();

            if (!message.IsDeletedForAll)
            {
                message.IsDeleted = true;
                message.IsDeletedForAll = true;
                message.DeletedAt = DateTime.UtcNow;
                message.Text = "Сообщение удалено";

                var attachments = await _context.ChatMessageAttachments
                    .Where(x => x.ChatMessageId == message.Id)
                    .ToListAsync();

                if (attachments.Count > 0)
                {
                    _context.ChatMessageAttachments.RemoveRange(attachments);
                }

                await _context.SaveChangesAsync();
            }

            var deletePayload = new
            {
                chatId = message.ChatId,
                messageId = message.Id,
                deleteForAll = true,
                deletedAtUtc = message.DeletedAt
            };

            await _chatHub.Clients
                .Group($"chat_{message.ChatId}")
                .SendAsync("MessageDeletedForAll", deletePayload);

            return Ok(deletePayload);
        }

        var chatForCurrentUser = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == message.ChatId);

        if (chatForCurrentUser == null)
            return NotFound(new { message = "Чат не найден." });

        var hasAccessToMessageChat = await HasAccessToChatAsync(chatForCurrentUser, currentUserId.Value);
        if (!hasAccessToMessageChat)
            return Forbid();

        var alreadyHidden = await _context.HiddenChatMessages
            .AnyAsync(x => x.MessageId == messageId && x.UserId == currentUserId.Value);

        if (!alreadyHidden)
        {
            _context.HiddenChatMessages.Add(new HiddenChatMessage
            {
                Id = Guid.NewGuid(),
                MessageId = messageId,
                UserId = currentUserId.Value,
                HiddenAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
        }

        return Ok(new
        {
            messageId = message.Id,
            deleteForAll = false
        });
    }

    [HttpPost("{chatId:guid}/private/delete-for-me")]
    public async Task<IActionResult> DeletePrivateChatForMe(Guid chatId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Private)
            return BadRequest(new { message = "Метод доступен только для личного чата." });

        if (chat.FirstUserId != currentUserId.Value && chat.SecondUserId != currentUserId.Value)
            return Forbid();

        var state = await _context.PrivateChatUserStates
            .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == currentUserId.Value);

        if (state == null)
        {
            state = new PrivateChatUserState
            {
                Id = Guid.NewGuid(),
                ChatId = chatId,
                UserId = currentUserId.Value,
                ClearedAt = DateTime.UtcNow
            };

            _context.PrivateChatUserStates.Add(state);
        }
        else
        {
            state.ClearedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        return Ok(new { message = "Чат удалён у текущего пользователя." });
    }

    [HttpDelete("{chatId:guid}/private/delete-for-all")]
    public async Task<IActionResult> DeletePrivateChatForAll(Guid chatId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .Include(x => x.Messages)
            .Include(x => x.PrivateChatStates)
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Private)
            return BadRequest(new { message = "Метод доступен только для личного чата." });

        if (chat.FirstUserId != currentUserId.Value && chat.SecondUserId != currentUserId.Value)
            return Forbid();

        _context.Chats.Remove(chat);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Чат удалён у всех." });
    }

    [HttpPost("private/{userId:guid}")]
    public async Task<IActionResult> GetOrCreatePrivateChat(Guid userId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (currentUserId.Value == userId)
            return BadRequest(new { message = "Нельзя создать личный чат с самим собой." });

        var targetUser = await _context.Users.FirstOrDefaultAsync(x => x.Id == userId);
        if (targetUser == null || targetUser.IsBlocked)
            return NotFound(new { message = "Пользователь не найден." });

        if (await IsPrivateCommunicationBlockedAsync(currentUserId.Value, userId))
            return BadRequest(new { message = "Личные сообщения недоступны." });

        var firstId = currentUserId.Value.CompareTo(userId) < 0 ? currentUserId.Value : userId;
        var secondId = currentUserId.Value.CompareTo(userId) < 0 ? userId : currentUserId.Value;

        var existingChat = await _context.Chats
            .FirstOrDefaultAsync(x =>
                x.Type == ChatType.Private &&
                x.FirstUserId == firstId &&
                x.SecondUserId == secondId);

        if (existingChat != null)
        {
            return Ok(new
            {
                chatId = existingChat.Id,
                name = existingChat.Name
            });
        }

        var chat = new Chat
        {
            Id = Guid.NewGuid(),
            Name = $"Личный чат: {currentUserId.Value} - {userId}",
            Type = ChatType.Private,
            FirstUserId = firstId,
            SecondUserId = secondId
        };

        _context.Chats.Add(chat);
        await _context.SaveChangesAsync();

        return Ok(new
        {
            chatId = chat.Id,
            name = chat.Name
        });
    }

    [HttpPost("group")]
    public async Task<IActionResult> CreateGroupChat(CreateGroupChatRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Название чата обязательно." });

        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var currentUser = await _userManager.FindByIdAsync(currentUserId.Value.ToString());
        if (currentUser == null)
            return NotFound(new { message = "Пользователь не найден." });

        var participantIds = request.ParticipantIds
            .Where(x => x != currentUserId.Value)
            .Distinct()
            .ToList();

        if (participantIds.Count > 0)
        {
            var existingUsersCount = await _context.Users
                .CountAsync(x => participantIds.Contains(x.Id));

            if (existingUsersCount != participantIds.Count)
                return BadRequest(new { message = "Один или несколько участников не найдены." });
        }

        string inviteCode;
        do
        {
            inviteCode = GenerateInviteCode();
        }
        while (await _context.Chats.AnyAsync(x => x.InviteCode == inviteCode));

        var chat = new Chat
        {
            Id = Guid.NewGuid(),
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            AvatarUrl = string.IsNullOrWhiteSpace(request.AvatarUrl) ? null : request.AvatarUrl.Trim(),
            Type = ChatType.Group,
            CreatedByUserId = currentUserId.Value,
            InviteCode = inviteCode,
            CanMembersInvite = request.CanMembersInvite,
            CreatedAt = DateTime.UtcNow
        };

        _context.Chats.Add(chat);

        var participants = new List<ChatParticipant>
        {
            new ChatParticipant
            {
                Id = Guid.NewGuid(),
                ChatId = chat.Id,
                UserId = currentUserId.Value,
                Role = ChatParticipantRole.Owner,
                JoinedAt = DateTime.UtcNow,
                Status = ChatParticipantStatus.Active
            }
        };

        participants.AddRange(participantIds.Select(participantUserId => new ChatParticipant
        {
            Id = Guid.NewGuid(),
            ChatId = chat.Id,
            UserId = participantUserId,
            Role = ChatParticipantRole.Member,
            JoinedAt = DateTime.UtcNow,
            Status = ChatParticipantStatus.Active
        }));

        _context.ChatParticipants.AddRange(participants);

        await _context.SaveChangesAsync();

        if (participantIds.Count > 0)
        {
            var addedUsers = await _context.Users
                .Where(x => participantIds.Contains(x.Id))
                .ToListAsync();

            await AddGroupSystemMessageAsync(chat, currentUser, BuildGroupCreatedWithParticipantsText(addedUsers));
        }

        return Ok(await BuildGroupChatDetailsResponse(chat, currentUserId.Value));
    }

    [HttpPost("upload-avatar")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxChatAvatarSizeBytes)]
    public async Task<IActionResult> UploadChatAvatar([FromForm] UploadChatAvatarRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var validationError = ValidateUploadedFile(
            request.File,
            AllowedChatAvatarContentTypes,
            MaxChatAvatarSizeBytes,
            "Допустимы только JPG, JPEG, PNG, WEBP.",
            "Максимальный размер файла — 5 МБ.");

        if (validationError != null)
            return validationError;

        var file = request.File!;
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var saved = await SaveChatFileAsync(file, "chat-avatars", extension);

        return Ok(new
        {
            avatarUrl = saved.FileUrl
        });
    }

    [HttpPost("upload-attachment")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxChatAttachmentSizeBytes)]
    public async Task<IActionResult> UploadChatAttachment([FromForm] UploadChatAttachmentRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var validationError = ValidateUploadedFile(
            request.File,
            AllowedChatAttachmentContentTypes,
            MaxChatAttachmentSizeBytes,
            "Недопустимый тип файла.",
            "Максимальный размер файла — 100 МБ.");

        if (validationError != null)
            return validationError;

        var file = request.File!;
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var saved = await SaveChatFileAsync(file, "chat-attachments", extension);

        var contentType = NormalizeContentTypeHeader(file.ContentType);
        if (string.IsNullOrWhiteSpace(contentType))
        {
            contentType = "application/octet-stream";
        }

        return Ok(new UploadChatAttachmentResponse
        {
            Id = Guid.NewGuid(),
            FileName = NormalizeFileNameForDisplay(file.FileName),
            StoredFileName = saved.StoredFileName,
            FileUrl = saved.FileUrl,
            ContentType = contentType,
            Size = file.Length,
            AttachmentType = GetAttachmentType(contentType),
            IsVoiceMessage = false,
            VoiceDurationMs = null,
            VoiceWaveform = null
        });
    }

    [HttpGet("{chatId:guid}/details")]
    public async Task<IActionResult> GetChatDetails(Guid chatId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type == ChatType.Group)
        {
            var participant = await _context.ChatParticipants
                .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == currentUserId.Value);

            if (participant == null || participant.Status == ChatParticipantStatus.Left)
                return Forbid();

            return Ok(await BuildGroupChatDetailsResponse(chat, currentUserId.Value));
        }

        if (chat.Type == ChatType.Private)
        {
            var hasAccess =
                chat.FirstUserId == currentUserId.Value ||
                chat.SecondUserId == currentUserId.Value;

            if (!hasAccess)
                return Forbid();
        }

        return Ok(new
        {
            Id = chat.Id,
            Name = chat.Name,
            Description = chat.Description,
            AvatarUrl = chat.AvatarUrl,
            Type = chat.Type.ToString(),
            CanMembersInvite = chat.CanMembersInvite,
            InviteCode = chat.InviteCode,
            CreatedAt = chat.CreatedAt,
            CreatedByUserId = chat.CreatedByUserId
        });
    }

    [HttpPost("{chatId:guid}/leave")]
    public async Task<IActionResult> LeaveChat(Guid chatId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Group)
            return BadRequest(new { message = "Выйти можно только из группового чата." });

        var participant = await _context.ChatParticipants
            .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == currentUserId.Value);

        if (participant == null)
            return NotFound(new { message = "Вы не состоите в этом чате." });

        if (participant.Role == ChatParticipantRole.Owner)
            return BadRequest(new { message = "Владелец не может выйти из чата, пока не передаст права другому участнику." });

        participant.Status = ChatParticipantStatus.Left;
        participant.StatusChangedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { message = "Вы вышли из чата." });
    }



    [HttpPost("{chatId:guid}/transfer-ownership/{newOwnerUserId:guid}")]
    public async Task<IActionResult> TransferOwnership(Guid chatId, Guid newOwnerUserId)
    {
        var currentUserId = GetCurrentUserId();

        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Group)
            return BadRequest(new { message = "Передача прав доступна только для группового чата." });

        if (chat.IsDeletedByOwner)
            return BadRequest(new { message = "Чат удалён владельцем. Передача прав недоступна." });

        var currentParticipant = await GetParticipantAsync(chatId, currentUserId.Value);
        if (currentParticipant == null || currentParticipant.Status != ChatParticipantStatus.Active || currentParticipant.Role != ChatParticipantRole.Owner)
            return Forbid();

        if (newOwnerUserId == currentUserId.Value)
            return BadRequest(new { message = "Нельзя передать права самому себе." });

        var targetParticipant = await GetParticipantAsync(chatId, newOwnerUserId);
        if (targetParticipant == null)
            return NotFound(new { message = "Новый владелец не найден в этом чате." });

        if (targetParticipant.Status != ChatParticipantStatus.Active)
            return BadRequest(new { message = "Передать права можно только активному участнику." });

        if (targetParticipant.Role == ChatParticipantRole.Owner)
            return BadRequest(new { message = "Этот участник уже является владельцем." });

        currentParticipant.Role = ChatParticipantRole.Admin;
        targetParticipant.Role = ChatParticipantRole.Owner;
        chat.CreatedByUserId = newOwnerUserId;

        await _context.SaveChangesAsync();

        var response = await BuildGroupChatDetailsResponse(chat, currentUserId.Value);

        await _chatHub.Clients
            .Group($"chat_{chatId}")
            .SendAsync("ChatUpdated", response);

        var participantUserIds = await _context.ChatParticipants
            .Where(x => x.ChatId == chatId && x.Status == ChatParticipantStatus.Active)
            .Select(x => x.UserId)
            .ToListAsync();

        foreach (var participantUserId in participantUserIds)
        {
            await _chatHub.Clients
                .Group($"user_{participantUserId}")
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId,
                    chatName = chat.Name,
                    avatarUrl = chat.AvatarUrl,
                    updatedAtUtc = DateTime.UtcNow,
                    isService = true
                });
        }

        return Ok(response);
    }

    [HttpPatch("{chatId:guid}/group")]
    public async Task<IActionResult> UpdateGroupChat(Guid chatId, UpdateGroupChatRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Название чата обязательно." });

        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Group)
            return BadRequest(new { message = "Редактировать можно только групповой чат." });

        var currentParticipant = await GetParticipantAsync(chatId, currentUserId.Value);
        if (currentParticipant == null || currentParticipant.Status != ChatParticipantStatus.Active)
            return Forbid();

        if (currentParticipant.Role != ChatParticipantRole.Owner &&
            currentParticipant.Role != ChatParticipantRole.Admin)
        {
            return Forbid();
        }

        if (chat.IsDeletedByOwner)
            return BadRequest(new { message = "Чат удалён владельцем и больше не может редактироваться." });

        chat.Name = request.Name.Trim();
        chat.Description = string.IsNullOrWhiteSpace(request.Description)
            ? null
            : request.Description.Trim();
        chat.AvatarUrl = string.IsNullOrWhiteSpace(request.AvatarUrl)
            ? null
            : request.AvatarUrl.Trim();
        chat.CanMembersInvite = request.CanMembersInvite;

        await _context.SaveChangesAsync();

        var response = await BuildGroupChatDetailsResponse(chat, currentUserId.Value);

        await _chatHub.Clients
            .Group($"chat_{chatId}")
            .SendAsync("ChatUpdated", response);

        var participantUserIds = await _context.ChatParticipants
            .Where(x => x.ChatId == chatId && x.Status == ChatParticipantStatus.Active)
            .Select(x => x.UserId)
            .ToListAsync();

        foreach (var participantUserId in participantUserIds)
        {
            await _chatHub.Clients
                .Group($"user_{participantUserId}")
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId,
                    chatName = chat.Name,
                    avatarUrl = chat.AvatarUrl,
                    updatedAtUtc = DateTime.UtcNow,
                    isService = true
                });
        }

        return Ok(response);
    }

    [HttpPost("{chatId:guid}/participants")]
    public async Task<IActionResult> AddParticipants(Guid chatId, AddChatParticipantsRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var currentUser = await _userManager.FindByIdAsync(currentUserId.Value.ToString());
        if (currentUser == null)
            return NotFound(new { message = "Пользователь не найден." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Group)
            return BadRequest(new { message = "Добавлять участников можно только в групповой чат." });

        if (chat.IsDeletedByOwner)
            return BadRequest(new { message = "Чат удалён владельцем. Добавление участников недоступно." });

        var currentParticipant = await GetParticipantAsync(chatId, currentUserId.Value);
        if (currentParticipant == null || currentParticipant.Status != ChatParticipantStatus.Active)
            return Forbid();

        var canManage =
            currentParticipant.Role == ChatParticipantRole.Owner ||
            currentParticipant.Role == ChatParticipantRole.Admin ||
            (currentParticipant.Role == ChatParticipantRole.Member && chat.CanMembersInvite);

        if (!canManage)
            return Forbid();

        var userIds = request.UserIds
            .Where(x => x != currentUserId.Value)
            .Distinct()
            .ToList();

        if (userIds.Count == 0)
            return BadRequest(new { message = "Не выбраны участники для добавления." });

        var existingUsers = await _context.Users
            .Where(x => userIds.Contains(x.Id))
            .ToListAsync();

        if (existingUsers.Count != userIds.Count)
            return BadRequest(new { message = "Один или несколько пользователей не найдены." });

        var existingParticipants = await _context.ChatParticipants
            .Where(x => x.ChatId == chatId && userIds.Contains(x.UserId))
            .ToListAsync();

        var now = DateTime.UtcNow;
        var existingParticipantMap = existingParticipants.ToDictionary(x => x.UserId, x => x);
        var newParticipants = new List<ChatParticipant>();
        var addedUserIds = new List<Guid>();
        var changedExisting = false;

        foreach (var participantUserId in userIds)
        {
            if (existingParticipantMap.TryGetValue(participantUserId, out var existingParticipant))
            {
                if (existingParticipant.Status != ChatParticipantStatus.Active)
                {
                    existingParticipant.Status = ChatParticipantStatus.Active;
                    existingParticipant.StatusChangedAt = now;
                    existingParticipant.JoinedAt = now;
                    existingParticipant.Role = ChatParticipantRole.Member;
                    addedUserIds.Add(participantUserId);
                    changedExisting = true;
                }

                continue;
            }

            addedUserIds.Add(participantUserId);
            newParticipants.Add(new ChatParticipant
            {
                Id = Guid.NewGuid(),
                ChatId = chatId,
                UserId = participantUserId,
                Role = ChatParticipantRole.Member,
                JoinedAt = now,
                Status = ChatParticipantStatus.Active
            });
        }

        if (newParticipants.Count == 0 && !changedExisting)
            return BadRequest(new { message = "Все выбранные пользователи уже состоят в чате." });

        if (newParticipants.Count > 0)
            _context.ChatParticipants.AddRange(newParticipants);

        await _context.SaveChangesAsync();

        if (addedUserIds.Count > 0)
        {
            var addedUsers = existingUsers
                .Where(x => addedUserIds.Contains(x.Id))
                .ToList();

            await AddGroupSystemMessageAsync(chat, currentUser, BuildParticipantsAddedText(addedUsers));
        }

        return Ok(await BuildGroupChatDetailsResponse(chat, currentUserId.Value));
    }

    [HttpDelete("{chatId:guid}/participants/{userId:guid}")]
    public async Task<IActionResult> RemoveParticipant(Guid chatId, Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Group)
            return BadRequest(new { message = "Удалять участников можно только из группового чата." });

        if (chat.IsDeletedByOwner)
            return BadRequest(new { message = "Чат удалён владельцем. Изменение участников недоступно." });

        var currentParticipant = await GetParticipantAsync(chatId, currentUserId.Value);
        if (currentParticipant == null || currentParticipant.Status != ChatParticipantStatus.Active)
            return Forbid();

        var targetParticipant = await GetParticipantAsync(chatId, userId);
        if (targetParticipant == null)
            return NotFound(new { message = "Участник не найден в этом чате." });

        if (targetParticipant.Role == ChatParticipantRole.Owner)
            return BadRequest(new { message = "Нельзя удалить владельца чата." });

        if (targetParticipant.UserId == currentUserId.Value)
            return BadRequest(new { message = "Для выхода из чата используйте отдельную кнопку выхода." });

        var canRemove = false;

        if (currentParticipant.Role == ChatParticipantRole.Owner)
        {
            canRemove = true;
        }
        else if (currentParticipant.Role == ChatParticipantRole.Admin)
        {
            canRemove = targetParticipant.Role == ChatParticipantRole.Member;
        }

        if (!canRemove)
            return Forbid();

        if (targetParticipant.Status == ChatParticipantStatus.Removed)
            return BadRequest(new { message = "Участник уже исключён." });

        targetParticipant.Status = ChatParticipantStatus.Removed;
        targetParticipant.StatusChangedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var response = await BuildGroupChatDetailsResponse(chat, currentUserId.Value);

        await _chatHub.Clients
            .Group($"chat_{chatId}")
            .SendAsync("ChatUpdated", response);

        var participantUserIds = await _context.ChatParticipants
            .Where(x => x.ChatId == chatId && x.Status == ChatParticipantStatus.Active)
            .Select(x => x.UserId)
            .ToListAsync();

        foreach (var participantUserId in participantUserIds)
        {
            await _chatHub.Clients
                .Group($"user_{participantUserId}")
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId,
                    chatName = chat.Name,
                    avatarUrl = chat.AvatarUrl,
                    updatedAtUtc = DateTime.UtcNow,
                    isService = true
                });
        }

        return Ok(response);
    }

    [HttpDelete("{chatId:guid}/group/delete-for-me")]
    public async Task<IActionResult> DeleteGroupChatForMe(Guid chatId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats.FirstOrDefaultAsync(x => x.Id == chatId);
        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Group)
            return BadRequest(new { message = "Метод доступен только для группового чата." });

        var participant = await _context.ChatParticipants
            .FirstOrDefaultAsync(x => x.ChatId == chatId && x.UserId == currentUserId.Value);

        if (participant == null)
            return NotFound(new { message = "Чат не найден." });

        if (participant.Status == ChatParticipantStatus.Left)
            return Ok(new { message = "Чат уже удалён у вас." });

        participant.Status = ChatParticipantStatus.Left;
        participant.StatusChangedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { message = "Чат удалён у вас." });
    }

    [HttpPatch("{chatId:guid}/participants/{userId:guid}/role")]
    public async Task<IActionResult> UpdateParticipantRole(
        Guid chatId,
        Guid userId,
        UpdateChatParticipantRoleRequest request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Group)
            return BadRequest(new { message = "Менять роли можно только в групповом чате." });

        if (chat.IsDeletedByOwner)
            return BadRequest(new { message = "Чат удалён владельцем. Изменение ролей недоступно." });

        var currentParticipant = await GetParticipantAsync(chatId, currentUserId.Value);
        if (currentParticipant == null || currentParticipant.Role != ChatParticipantRole.Owner || currentParticipant.Status != ChatParticipantStatus.Active)
            return Forbid();

        var targetParticipant = await GetParticipantAsync(chatId, userId);
        if (targetParticipant == null)
            return NotFound(new { message = "Участник не найден в этом чате." });

        if (targetParticipant.Role == ChatParticipantRole.Owner)
            return BadRequest(new { message = "Нельзя изменить роль владельца." });

        if (targetParticipant.Status != ChatParticipantStatus.Active)
            return BadRequest(new { message = "Менять роль можно только активному участнику." });

        if (!Enum.TryParse<ChatParticipantRole>(request.Role, true, out var newRole))
            return BadRequest(new { message = "Некорректная роль." });

        if (newRole != ChatParticipantRole.Member && newRole != ChatParticipantRole.Admin)
            return BadRequest(new { message = "Можно назначать только роли Member или Admin." });

        targetParticipant.Role = newRole;
        await _context.SaveChangesAsync();

        var response = await BuildGroupChatDetailsResponse(chat, currentUserId.Value);

        await _chatHub.Clients
            .Group($"chat_{chatId}")
            .SendAsync("ChatUpdated", response);

        var participantUserIds = await _context.ChatParticipants
            .Where(x => x.ChatId == chatId && x.Status == ChatParticipantStatus.Active)
            .Select(x => x.UserId)
            .ToListAsync();

        foreach (var participantUserId in participantUserIds)
        {
            await _chatHub.Clients
                .Group($"user_{participantUserId}")
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId,
                    chatName = chat.Name,
                    avatarUrl = chat.AvatarUrl,
                    updatedAtUtc = DateTime.UtcNow,
                    isService = true
                });
        }

        return Ok(response);
    }

    [HttpPost("{chatId:guid}/group/delete")]
    public async Task<IActionResult> DeleteGroupChat(Guid chatId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return NotFound(new { message = "Чат не найден." });

        if (chat.Type != ChatType.Group)
            return BadRequest(new { message = "Метод доступен только для группового чата." });

        var currentParticipant = await GetParticipantAsync(chatId, currentUserId.Value);
        if (currentParticipant == null || currentParticipant.Role != ChatParticipantRole.Owner || currentParticipant.Status != ChatParticipantStatus.Active)
            return Forbid();

        if (chat.IsDeletedByOwner)
            return BadRequest(new { message = "Чат уже удалён владельцем." });

        chat.IsDeletedByOwner = true;
        chat.DeletedByOwnerAt = DateTime.UtcNow;
        chat.DeletedByOwnerUserId = currentUserId.Value;

        await _context.SaveChangesAsync();

        var response = await BuildGroupChatDetailsResponse(chat, currentUserId.Value);

        await _chatHub.Clients
            .Group($"chat_{chatId}")
            .SendAsync("ChatUpdated", response);

        var participantUserIds = await _context.ChatParticipants
            .Where(x => x.ChatId == chatId && x.Status == ChatParticipantStatus.Active)
            .Select(x => x.UserId)
            .ToListAsync();

        foreach (var participantUserId in participantUserIds)
        {
            await _chatHub.Clients
                .Group($"user_{participantUserId}")
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId,
                    chatName = chat.Name,
                    avatarUrl = chat.AvatarUrl,
                    updatedAtUtc = DateTime.UtcNow,
                    isService = true
                });
        }

        return Ok(response);
    }

    private async Task<ChatMessageResponse> AddGroupSystemMessageAsync(Chat chat, AppUser actor, string text)
    {
        var message = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ChatId = chat.Id,
            UserId = actor.Id,
            Text = NormalizeMessageText(text),
            SentAt = DateTime.UtcNow,
            IsDeleted = false,
            IsDeletedForAll = false,
            DeletedAt = null
        };

        _context.ChatMessages.Add(message);
        await _context.SaveChangesAsync();

        var response = BuildChatMessageResponse(message, actor, null, Array.Empty<ChatMessageAttachment>());

        await _chatHub.Clients
            .Group($"chat_{chat.Id}")
            .SendAsync("ReceiveMessage", response);

        var notificationRecipients = await GetChatNotificationRecipientsAsync(chat.Id, actor.Id);
        var messagePreview = BuildMessageNotificationPreview(response);

        foreach (var recipient in notificationRecipients)
        {
            await _chatHub.Clients
                .Group($"user_{recipient.UserId}")
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId = chat.Id,
                    messageId = response.Id,
                    senderUserId = actor.Id,
                    senderName = GetDisplayName(actor),
                    chatName = chat.Name,
                    messagePreview,
                    isMuted = recipient.IsMuted,
                    updatedAtUtc = DateTime.UtcNow
                });
        }

        return response;
    }

    private static string BuildMessageNotificationPreview(ChatMessageResponse message)
    {
        if (!string.IsNullOrWhiteSpace(message.Text))
        {
            var text = message.Text.Trim();
            return text.Length <= 80 ? text : text[..80] + "…";
        }

        if (message.SharedFishingEntryId.HasValue)
            return "Запись из ленты";

        if (message.Attachments.Count == 1 && message.Attachments[0].IsVoiceMessage)
            return "Голосовое сообщение";

        if (message.Attachments.Count == 1)
            return "Вложение";

        if (message.Attachments.Count > 1)
            return $"Вложения: {message.Attachments.Count}";

        return "Новое сообщение";
    }

    private sealed record ChatNotificationRecipient(Guid UserId, bool IsMuted);

    private async Task<List<ChatNotificationRecipient>> GetChatNotificationRecipientsAsync(Guid chatId, Guid senderUserId)
    {
        var chat = await _context.Chats
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return new List<ChatNotificationRecipient>();

        if (chat.Type == ChatType.Private)
        {
            var recipientIds = new[] { chat.FirstUserId, chat.SecondUserId }
                .Where(x => x.HasValue)
                .Select(x => x!.Value)
                .Where(x => x != senderUserId)
                .Distinct()
                .ToList();

            if (recipientIds.Count == 0)
                return new List<ChatNotificationRecipient>();

            var blockedRecipientIds = await _context.Users
                .Where(x => recipientIds.Contains(x.Id) && x.IsBlocked)
                .Select(x => x.Id)
                .ToListAsync();

            var interactionBlockedRecipientIds = await _context.UserBlocks
                .Where(x =>
                    (recipientIds.Contains(x.BlockerUserId) && x.BlockedUserId == senderUserId) ||
                    (recipientIds.Contains(x.BlockedUserId) && x.BlockerUserId == senderUserId))
                .Select(x => x.BlockerUserId == senderUserId ? x.BlockedUserId : x.BlockerUserId)
                .ToListAsync();

            var blockedSet = blockedRecipientIds
                .Concat(interactionBlockedRecipientIds)
                .ToHashSet();

            recipientIds = recipientIds
                .Where(x => !blockedSet.Contains(x))
                .ToList();

            if (recipientIds.Count == 0)
                return new List<ChatNotificationRecipient>();

            var mutedUserIds = await _context.PrivateChatUserStates
                .Where(x => x.ChatId == chatId && recipientIds.Contains(x.UserId) && x.IsMuted)
                .Select(x => x.UserId)
                .ToListAsync();

            var mutedSet = mutedUserIds.ToHashSet();

            return recipientIds
                .Select(x => new ChatNotificationRecipient(x, mutedSet.Contains(x)))
                .ToList();
        }

        if (chat.Type == ChatType.Group)
        {
            return await _context.ChatParticipants
                .Where(x =>
                    x.ChatId == chatId &&
                    x.UserId != senderUserId &&
                    x.Status == ChatParticipantStatus.Active &&
                    !x.User.IsBlocked)
                .Select(x => new ChatNotificationRecipient(x.UserId, x.IsMuted))
                .ToListAsync();
        }

        return new List<ChatNotificationRecipient>();
    }


}
