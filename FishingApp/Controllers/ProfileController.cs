using System.Text.RegularExpressions;
using System.Security.Claims;
using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using FishingApp.Api.DTOs.Profile;
using FishingApp.Api.DTOs.Chat;
using FishingApp.Api.DTOs.FishingEntries;
using FishingApp.Api.Hubs;
using FishingApp.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FishingApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ProfileController : ControllerBase
{
    private const int MaxNameLength = 80;
    private const int MaxRegionLength = 120;
    private const int MaxAboutLength = 1000;
    private const int MaxAvatarUrlLength = 500;
    private const int MaxBlockReasonTextLength = 500;
    private const int MaxBlockAppealTextLength = 2000;
    private const int MaxUserReportTextLength = 1000;
    private const string SupportEmail = "rassokha.lesha@yandex.ru";

    private static readonly Dictionary<string, string> BlockReasonLabels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["nudity"] = "Нагота или материалы сексуального характера",
        ["drugs"] = "Наркотики или запрещённые вещества",
        ["illegal_ads"] = "Реклама запрещённых товаров или услуг",
        ["spam"] = "Спам или массовая реклама",
        ["abuse"] = "Оскорбления, угрозы или травля",
        ["fraud"] = "Мошенничество или попытка обмана",
        ["rules"] = "Нарушение правил сервиса",
        ["other"] = "Другая причина"
    };

    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _context;
    private readonly IHubContext<ChatHub> _chatHub;

    public ProfileController(
        UserManager<AppUser> userManager,
        AppDbContext context,
        IHubContext<ChatHub> chatHub)
    {
        _userManager = userManager;
        _context = context;
        _chatHub = chatHub;
    }

    [HttpGet]
    public async Task<IActionResult> GetProfile()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var user = await _userManager.FindByIdAsync(userIdClaim);

        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        var response = ToProfileResponse(user, user.Id);
        if (user.IsBlocked)
        {
            response.BlockAppealSubmitted = await HasSubmittedBlockAppealAsync(user);
        }

        return Ok(response);
    }

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> GetPublicProfile(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        var currentUserIsAdmin = currentUserId.HasValue && await IsCurrentUserAdminAsync(currentUserId.Value);

        var user = await _userManager.Users
            .FirstOrDefaultAsync(x => x.Id == userId);

        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        var isBlockedByCurrentUser = false;
        var hasBlockedCurrentUser = false;

        if (currentUserId.HasValue && currentUserId.Value != userId)
        {
            var blocks = await _context.UserBlocks
                .AsNoTracking()
                .Where(x =>
                    (x.BlockerUserId == currentUserId.Value && x.BlockedUserId == userId) ||
                    (x.BlockerUserId == userId && x.BlockedUserId == currentUserId.Value))
                .ToListAsync();

            isBlockedByCurrentUser = blocks.Any(x => x.BlockerUserId == currentUserId.Value && x.BlockedUserId == userId);
            hasBlockedCurrentUser = blocks.Any(x => x.BlockerUserId == userId && x.BlockedUserId == currentUserId.Value);
        }

        var isInteractionBlocked = (isBlockedByCurrentUser || hasBlockedCurrentUser) && !currentUserIsAdmin;
        var shouldHideBlockedProfile = user.IsBlocked && !currentUserIsAdmin;
        var shouldHideProfile = shouldHideBlockedProfile || isInteractionBlocked;

        var entries = shouldHideProfile
            ? new List<FishingEntryResponse>()
            : await _context.FishingEntries
            .Where(x => x.UserId == userId && x.Visibility == FishingEntryVisibility.PublicProfile)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new FishingEntryResponse
            {
                Id = x.Id,
                Title = x.Title,
                Description = x.Description,
                FishingDate = x.FishingDate,
                FishingStartedAt = x.FishingStartedAt == default ? x.FishingDate : x.FishingStartedAt,
                FishingEndedAt = x.FishingEndedAt,
                LocationName = x.LocationName,
                Latitude = x.Latitude,
                Longitude = x.Longitude,
                CatchType = x.CatchType,
                CatchWeight = x.CatchWeight,
                Bait = x.Bait,
                WeatherSummary = x.WeatherSummary,
                PhotoUrl = x.PhotoUrl,
                Media = x.Media
                    .OrderBy(media => media.SortOrder)
                    .ThenBy(media => media.CreatedAt)
                    .Select(media => new FishingEntryMediaResponse
                    {
                        Id = media.Id,
                        Url = media.Url,
                        MediaType = media.MediaType,
                        SortOrder = media.SortOrder
                    })
                    .ToList(),
                Visibility = x.Visibility,
                IsPublishedToFeed = x.IsPublishedToFeed,
                CreatedAt = x.CreatedAt
            })
            .ToListAsync();

        var response = new PublicUserProfileResponse
        {
            Id = user.Id,
            UserName = user.UserName ?? string.Empty,
            FirstName = shouldHideProfile ? null : user.FirstName,
            LastName = shouldHideProfile ? null : user.LastName,
            DisplayName = shouldHideBlockedProfile
                ? "Аккаунт заблокирован"
                : isInteractionBlocked
                    ? "Профиль недоступен"
                    : GetDisplayName(user),
            Region = shouldHideProfile ? null : user.Region,
            About = shouldHideProfile ? null : user.About,
            AvatarUrl = shouldHideProfile ? null : user.AvatarUrl,
            CreatedAt = user.CreatedAt,
            IsBlocked = user.IsBlocked,
            BlockReasonCode = (currentUserIsAdmin || currentUserId == user.Id) ? user.BlockReasonCode : null,
            BlockReasonText = (currentUserIsAdmin || currentUserId == user.Id) ? GetBlockReasonDisplayText(user) : null,
            BlockedAtUtc = (currentUserIsAdmin || currentUserId == user.Id) ? user.BlockedAtUtc : null,
            IsBlockedByCurrentUser = isBlockedByCurrentUser,
            HasBlockedCurrentUser = hasBlockedCurrentUser,
            IsInteractionBlocked = isInteractionBlocked,
            InteractionBlockText = GetInteractionBlockText(isBlockedByCurrentUser, hasBlockedCurrentUser),
            Entries = entries
        };

        return Ok(response);
    }

    [HttpGet("by-username/{userName}")]
    public async Task<IActionResult> GetPublicProfileByUserName(string userName)
    {
        var normalizedUserName = NormalizeUserName(userName);

        var user = await _userManager.Users
            .FirstOrDefaultAsync(x => x.NormalizedUserName == normalizedUserName.ToUpperInvariant());

        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        return await GetPublicProfile(user.Id);
    }

    [HttpPost("block-appeal")]
    public async Task<IActionResult> SubmitBlockAppeal(SubmitBlockAppealRequest? request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var user = await _userManager.FindByIdAsync(currentUserId.Value.ToString());
        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        if (!user.IsBlocked)
            return BadRequest(new { message = "Аккаунт не заблокирован." });

        if (await HasSubmittedBlockAppealAsync(user))
        {
            return Ok(new
            {
                message = "Обращение уже отправлено. Ожидайте решения администрации.",
                alreadySubmitted = true
            });
        }

        var appealText = NormalizeOptionalText(request?.Message, MaxBlockAppealTextLength);
        if (string.IsNullOrWhiteSpace(appealText))
            return BadRequest(new { message = "Укажите текст обращения." });

        var admins = (await _userManager.GetUsersInRoleAsync("Admin"))
            .Where(x => !x.IsBlocked)
            .OrderBy(x => x.CreatedAt)
            .ToList();

        if (admins.Count == 0)
            return BadRequest(new { message = "Администраторы не найдены." });

        var now = DateTime.UtcNow;
        var displayName = GetDisplayName(user);
        var chatName = $"Обращение по блокировке: {displayName}";
        var chatDescription = $"Служебный чат для рассмотрения обращения пользователя {displayName}.";

        var chat = await _context.Chats
            .Include(x => x.Participants)
            .FirstOrDefaultAsync(x =>
                x.Type == ChatType.Group &&
                x.Name == chatName &&
                x.Description == chatDescription);

        if (chat == null)
        {
            chat = new Chat
            {
                Id = Guid.NewGuid(),
                Name = chatName,
                Description = chatDescription,
                Type = ChatType.Group,
                CreatedByUserId = admins[0].Id,
                CanMembersInvite = false,
                CreatedAt = now
            };

            _context.Chats.Add(chat);
        }

        var participantsByUserId = chat.Participants.ToDictionary(x => x.UserId, x => x);
        var participantIndex = 0;

        foreach (var admin in admins)
        {
            if (participantsByUserId.TryGetValue(admin.Id, out var participant))
            {
                if (participant.Status != ChatParticipantStatus.Active)
                {
                    participant.Status = ChatParticipantStatus.Active;
                    participant.StatusChangedAt = now;
                    participant.JoinedAt = now;
                }

                if (participantIndex == 0 && participant.Role != ChatParticipantRole.Owner)
                    participant.Role = ChatParticipantRole.Owner;
                else if (participantIndex > 0 && participant.Role == ChatParticipantRole.Member)
                    participant.Role = ChatParticipantRole.Admin;

                participantIndex++;
                continue;
            }

            _context.ChatParticipants.Add(new ChatParticipant
            {
                Id = Guid.NewGuid(),
                ChatId = chat.Id,
                UserId = admin.Id,
                Role = participantIndex == 0 ? ChatParticipantRole.Owner : ChatParticipantRole.Admin,
                JoinedAt = now,
                Status = ChatParticipantStatus.Active
            });

            participantIndex++;
        }

        var reason = GetBlockReasonDisplayText(user) ?? "Нарушение правил сервиса";
        var userLabel = string.IsNullOrWhiteSpace(user.Email)
            ? displayName
            : $"{displayName} ({user.Email})";

        var messageText =
            "Пользователь отправил обращение по блокировке.\n\n" +
            $"Пользователь: {userLabel}\n" +
            $"Причина блокировки: {reason}\n\n" +
            "Текст обращения:\n" +
            appealText;

        var message = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ChatId = chat.Id,
            UserId = user.Id,
            Text = messageText,
            SentAt = now,
            IsDeleted = false,
            IsDeletedForAll = false
        };

        _context.ChatMessages.Add(message);
        await _context.SaveChangesAsync();

        await _chatHub.Clients
            .Group($"chat_{chat.Id}")
            .SendAsync("ReceiveMessage", new
            {
                id = message.Id,
                chatId = chat.Id,
                userId = user.Id,
                userName = displayName,
                userAvatarUrl = (string?)null,
                text = message.Text,
                sentAt = message.SentAt,
                replyToMessageId = (Guid?)null,
                replyToUserName = (string?)null,
                replyToText = (string?)null,
                sharedFishingEntryId = (Guid?)null,
                sharedFishingEntry = (object?)null,
                isDeleted = false,
                isDeletedForAll = false,
                isReadByOthers = false,
                attachments = Array.Empty<object>()
            });

        foreach (var admin in admins)
        {
            await _chatHub.Clients
                .Group(ChatHub.GetUserGroupName(admin.Id))
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId = chat.Id,
                    messageId = message.Id,
                    senderUserId = user.Id,
                    senderName = displayName,
                    chatName = chat.Name,
                    messagePreview = "Обращение по блокировке",
                    isMuted = false,
                    updatedAtUtc = now
                });
        }

        return Ok(new
        {
            message = "Обращение отправлено. Ожидайте решения администрации.",
            supportEmail = SupportEmail,
            alreadySubmitted = false
        });
    }

    [HttpPost("{userId:guid}/report")]
    public async Task<IActionResult> ReportUser(Guid userId, UserReportRequest? request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (currentUserId.Value == userId)
            return BadRequest(new { message = "Нельзя пожаловаться на самого себя." });

        var reporter = await _userManager.FindByIdAsync(currentUserId.Value.ToString());
        if (reporter == null)
            return NotFound(new { message = "Пользователь не найден." });

        var targetUser = await _userManager.FindByIdAsync(userId.ToString());
        if (targetUser == null)
            return NotFound(new { message = "Пользователь не найден." });

        var normalizedReason = NormalizeUserReportReason(request);
        if (normalizedReason.ErrorMessage != null)
            return BadRequest(new { message = normalizedReason.ErrorMessage });

        var now = DateTime.UtcNow;
        var admins = (await _userManager.GetUsersInRoleAsync("Admin"))
            .Where(x => !x.IsBlocked)
            .OrderBy(x => x.CreatedAt)
            .ToList();

        if (admins.Count == 0)
            return BadRequest(new { message = "Администраторы не найдены." });

        var chat = await EnsureAdminServiceChatAsync(
            "Жалобы на пользователей",
            "Служебный чат для рассмотрения жалоб на пользователей.",
            admins,
            now);

        var report = new UserReport
        {
            Id = Guid.NewGuid(),
            ReporterUserId = reporter.Id,
            TargetUserId = targetUser.Id,
            ReasonCode = normalizedReason.ReasonCode!,
            ReasonText = normalizedReason.ReasonText,
            Status = "New",
            CreatedAtUtc = now,
            AdminChatId = chat.Id
        };

        _context.UserReports.Add(report);

        var reason = BlockReasonLabels.TryGetValue(normalizedReason.ReasonCode!, out var reportReasonLabel)
            ? reportReasonLabel
            : "Нарушение правил сервиса";
        var reporterLabel = GetUserAdminLabel(reporter);
        var targetLabel = GetUserAdminLabel(targetUser);
        var reporterProfileUrl = BuildFrontendProfileUrl(reporter.Id);
        var targetProfileUrl = BuildFrontendProfileUrl(targetUser.Id);

        var messageText =
            "Поступила жалоба на пользователя.\n\n" +
            $"Заявитель: {reporterLabel}\n" +
            $"Профиль заявителя: {reporterProfileUrl}\n\n" +
            $"Пользователь: {targetLabel}\n" +
            $"Профиль пользователя: {targetProfileUrl}\n\n" +
            $"Причина: {reason}";

        if (!string.IsNullOrWhiteSpace(normalizedReason.ReasonText))
        {
            messageText += "\n\nКомментарий:\n" + normalizedReason.ReasonText;
        }

        var message = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ChatId = chat.Id,
            UserId = reporter.Id,
            Text = messageText,
            SentAt = now,
            IsDeleted = false,
            IsDeletedForAll = false
        };

        _context.ChatMessages.Add(message);
        await _context.SaveChangesAsync();

        await NotifyAdminServiceChatAsync(chat, message, reporter, admins, "Жалоба на пользователя", now);

        return Ok(new { message = "Жалоба отправлена. Администрация рассмотрит обращение." });
    }

    [HttpPost("{userId:guid}/block")]
    public async Task<IActionResult> BlockUser(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (currentUserId.Value == userId)
            return BadRequest(new { message = "Нельзя добавить в черный список самого себя." });

        var targetUser = await _context.Users.FirstOrDefaultAsync(x => x.Id == userId && !x.IsBlocked);
        if (targetUser == null)
            return NotFound(new { message = "Пользователь не найден." });

        var existingBlock = await _context.UserBlocks
            .FirstOrDefaultAsync(x => x.BlockerUserId == currentUserId.Value && x.BlockedUserId == userId);

        if (existingBlock == null)
        {
            _context.UserBlocks.Add(new UserBlock
            {
                Id = Guid.NewGuid(),
                BlockerUserId = currentUserId.Value,
                BlockedUserId = userId,
                CreatedAtUtc = DateTime.UtcNow
            });
        }

        var friendships = await _context.Friendships
            .Where(x =>
                (x.RequesterId == currentUserId.Value && x.AddresseeId == userId) ||
                (x.RequesterId == userId && x.AddresseeId == currentUserId.Value))
            .ToListAsync();

        if (friendships.Count > 0)
            _context.Friendships.RemoveRange(friendships);

        await _context.SaveChangesAsync();

        await NotifyNavigationChangedAsync(currentUserId.Value, userId, "user-blocked");

        return Ok(new
        {
            userId,
            isBlockedByCurrentUser = true,
            isInteractionBlocked = true,
            message = "Пользователь добавлен в черный список."
        });
    }

    [HttpDelete("{userId:guid}/block")]
    public async Task<IActionResult> UnblockUser(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var existingBlock = await _context.UserBlocks
            .FirstOrDefaultAsync(x => x.BlockerUserId == currentUserId.Value && x.BlockedUserId == userId);

        if (existingBlock != null)
        {
            _context.UserBlocks.Remove(existingBlock);
            await _context.SaveChangesAsync();
        }

        var hasBlockedCurrentUser = await _context.UserBlocks
            .AnyAsync(x => x.BlockerUserId == userId && x.BlockedUserId == currentUserId.Value);

        await NotifyNavigationChangedAsync(currentUserId.Value, userId, "user-unblocked");

        return Ok(new
        {
            userId,
            isBlockedByCurrentUser = false,
            hasBlockedCurrentUser,
            isInteractionBlocked = hasBlockedCurrentUser,
            message = "Пользователь удалён из черного списка."
        });
    }

    [HttpPost("admin/users/{userId:guid}/block")]
    public async Task<IActionResult> AdminBlockUser(Guid userId, AdminBlockUserRequest? request)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (!await IsCurrentUserAdminAsync(currentUserId.Value))
            return Forbid();

        if (currentUserId.Value == userId)
            return BadRequest(new { message = "Нельзя заблокировать самого себя." });

        var targetUser = await _userManager.FindByIdAsync(userId.ToString());
        if (targetUser == null)
            return NotFound(new { message = "Пользователь не найден." });

        if (await _userManager.IsInRoleAsync(targetUser, "Admin"))
            return BadRequest(new { message = "Нельзя заблокировать администратора." });

        var normalizedReason = NormalizeBlockReason(request);
        if (normalizedReason.ErrorMessage != null)
            return BadRequest(new { message = normalizedReason.ErrorMessage });

        targetUser.IsBlocked = true;
        targetUser.BlockReasonCode = normalizedReason.ReasonCode;
        targetUser.BlockReasonText = normalizedReason.ReasonText;
        targetUser.BlockedAtUtc = DateTime.UtcNow;
        targetUser.BlockedByUserId = currentUserId.Value;

        var result = await _userManager.UpdateAsync(targetUser);
        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось заблокировать пользователя.",
                errors = result.Errors.Select(x => x.Description)
            });
        }

        return Ok(new
        {
            userId = targetUser.Id,
            isBlocked = targetUser.IsBlocked,
            blockReasonCode = targetUser.BlockReasonCode,
            blockReasonText = GetBlockReasonDisplayText(targetUser),
            blockedAtUtc = targetUser.BlockedAtUtc,
            message = "Пользователь заблокирован."
        });
    }

    [HttpDelete("admin/users/{userId:guid}/block")]
    public async Task<IActionResult> AdminUnblockUser(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (!await IsCurrentUserAdminAsync(currentUserId.Value))
            return Forbid();

        var targetUser = await _userManager.FindByIdAsync(userId.ToString());
        if (targetUser == null)
            return NotFound(new { message = "Пользователь не найден." });

        targetUser.IsBlocked = false;
        targetUser.BlockReasonCode = null;
        targetUser.BlockReasonText = null;
        targetUser.BlockedAtUtc = null;
        targetUser.BlockedByUserId = null;

        var result = await _userManager.UpdateAsync(targetUser);
        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось разблокировать пользователя.",
                errors = result.Errors.Select(x => x.Description)
            });
        }

        return Ok(new
        {
            userId = targetUser.Id,
            isBlocked = targetUser.IsBlocked,
            message = "Пользователь разблокирован."
        });
    }

    [HttpPut("avatar")]
    public async Task<IActionResult> UpdateAvatar(UpdateAvatarRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var user = await _userManager.FindByIdAsync(userIdClaim);

        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        user.AvatarUrl = NormalizeOptionalText(request.AvatarUrl, MaxAvatarUrlLength);

        var result = await _userManager.UpdateAsync(user);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось обновить аватар.",
                errors = result.Errors.Select(x => x.Description)
            });
        }

        return Ok(ToProfileResponse(user));
    }


    [HttpPut("notification-settings")]
    public async Task<IActionResult> UpdateNotificationSettings(UpdateNotificationSettingsRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var user = await _userManager.FindByIdAsync(userIdClaim);

        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        user.ChatToastsEnabled = request.ChatToastsEnabled;
        user.HideChatMessageTextInNotifications = request.ChatToastsEnabled && request.HideChatMessageTextInNotifications;

        var result = await _userManager.UpdateAsync(user);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось обновить настройки уведомлений.",
                errors = result.Errors.Select(x => x.Description)
            });
        }

        return Ok(ToProfileResponse(user));
    }

    [HttpPut]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var user = await _userManager.FindByIdAsync(userIdClaim);

        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        var normalizedUserName = NormalizeUserName(request.UserName);
        var firstName = NormalizeRequiredText(request.FirstName, MaxNameLength);

        if (string.IsNullOrWhiteSpace(firstName))
            return BadRequest(new { message = "Укажите имя." });

        if (!IsUserNameValid(normalizedUserName))
        {
            return BadRequest(new
            {
                message = "Имя пользователя может содержать только латинские буквы, цифры, точку и нижнее подчёркивание."
            });
        }

        if (!string.Equals(user.UserName, normalizedUserName, StringComparison.OrdinalIgnoreCase))
        {
            var existingUser = await _userManager.FindByNameAsync(normalizedUserName);
            if (existingUser != null && existingUser.Id != user.Id)
            {
                return BadRequest(new { message = "Это имя пользователя уже занято." });
            }

            user.UserName = normalizedUserName;
        }

        user.FirstName = firstName;
        user.LastName = NormalizeOptionalText(request.LastName, MaxNameLength);
        user.Region = NormalizeOptionalText(request.Region, MaxRegionLength);
        user.About = NormalizeOptionalText(request.About, MaxAboutLength);
        user.AvatarUrl = NormalizeOptionalText(request.AvatarUrl, MaxAvatarUrlLength);

        var result = await _userManager.UpdateAsync(user);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось обновить профиль.",
                errors = result.Errors.Select(x => x.Description)
            });
        }

        return Ok(ToProfileResponse(user));
    }

    private static string GetInteractionBlockText(bool isBlockedByCurrentUser, bool hasBlockedCurrentUser)
    {
        if (isBlockedByCurrentUser)
            return "Вы добавили пользователя в черный список.";

        if (hasBlockedCurrentUser)
            return "Пользователь ограничил доступ к своему профилю.";

        return "Взаимодействие с пользователем ограничено.";
    }

    private static (string? ReasonCode, string? ReasonText, string? ErrorMessage) NormalizeUserReportReason(UserReportRequest? request)
    {
        var reasonCode = (request?.ReasonCode ?? request?.Reason ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(reasonCode))
            return (null, null, "Выберите причину жалобы.");

        if (!BlockReasonLabels.ContainsKey(reasonCode))
            return (null, null, "Некорректная причина жалобы.");

        var reasonText = NormalizeOptionalText(request?.ReasonText, MaxUserReportTextLength);

        if (reasonCode == "other" && string.IsNullOrWhiteSpace(reasonText))
            return (null, null, "Укажите текст жалобы.");

        return (reasonCode, reasonText, null);
    }

    private static string GetUserAdminLabel(AppUser user)
    {
        var displayName = GetDisplayName(user);
        var userName = string.IsNullOrWhiteSpace(user.UserName) ? null : $"@{user.UserName}";
        var email = string.IsNullOrWhiteSpace(user.Email) ? null : user.Email;

        var parts = new List<string> { displayName };

        if (!string.IsNullOrWhiteSpace(userName))
            parts.Add(userName);

        if (!string.IsNullOrWhiteSpace(email))
            parts.Add(email);

        return string.Join(" · ", parts);
    }

    private string BuildFrontendProfileUrl(Guid userId)
    {
        var origin = Request.Headers.Origin.FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(origin))
            return $"{origin.TrimEnd('/')}/users/{userId}";

        var forwardedProto = Request.Headers["X-Forwarded-Proto"].FirstOrDefault();
        var forwardedHost = Request.Headers["X-Forwarded-Host"].FirstOrDefault();

        var scheme = string.IsNullOrWhiteSpace(forwardedProto) ? Request.Scheme : forwardedProto;
        var host = string.IsNullOrWhiteSpace(forwardedHost) ? Request.Host.Value : forwardedHost;

        return $"{scheme}://{host}/users/{userId}";
    }

    private async Task<Chat> EnsureAdminServiceChatAsync(
        string name,
        string description,
        IReadOnlyCollection<AppUser> admins,
        DateTime now)
    {
        var chat = await _context.Chats
            .FirstOrDefaultAsync(x => x.Type == ChatType.Group && x.Name == name);

        if (chat == null)
        {
            chat = new Chat
            {
                Id = Guid.NewGuid(),
                Name = name,
                Description = description,
                Type = ChatType.Group,
                CreatedByUserId = admins.FirstOrDefault()?.Id,
                CreatedAt = now,
                CanMembersInvite = false,
                InviteCode = Guid.NewGuid().ToString("N")[..12]
            };

            _context.Chats.Add(chat);
            await _context.SaveChangesAsync();
        }

        var adminIds = admins.Select(x => x.Id).Distinct().ToList();
        var existingParticipants = await _context.ChatParticipants
            .Where(x => x.ChatId == chat.Id && adminIds.Contains(x.UserId))
            .ToListAsync();

        var participantByUserId = existingParticipants.ToDictionary(x => x.UserId, x => x);
        var hasOwner = existingParticipants.Any(x => x.Role == ChatParticipantRole.Owner && x.Status == ChatParticipantStatus.Active);
        var changed = false;

        foreach (var admin in admins)
        {
            if (participantByUserId.TryGetValue(admin.Id, out var participant))
            {
                if (participant.Status != ChatParticipantStatus.Active)
                {
                    participant.Status = ChatParticipantStatus.Active;
                    participant.StatusChangedAt = now;
                    participant.JoinedAt = now;
                    changed = true;
                }

                if (!hasOwner)
                {
                    participant.Role = ChatParticipantRole.Owner;
                    hasOwner = true;
                    changed = true;
                }
                else if (participant.Role == ChatParticipantRole.Member)
                {
                    participant.Role = ChatParticipantRole.Admin;
                    changed = true;
                }

                continue;
            }

            _context.ChatParticipants.Add(new ChatParticipant
            {
                Id = Guid.NewGuid(),
                ChatId = chat.Id,
                UserId = admin.Id,
                Role = hasOwner ? ChatParticipantRole.Admin : ChatParticipantRole.Owner,
                JoinedAt = now,
                Status = ChatParticipantStatus.Active
            });

            hasOwner = true;
            changed = true;
        }

        if (changed)
            await _context.SaveChangesAsync();

        return chat;
    }

    private async Task NotifyAdminServiceChatAsync(
        Chat chat,
        ChatMessage message,
        AppUser sender,
        IReadOnlyCollection<AppUser> admins,
        string title,
        DateTime now)
    {
        var response = new ChatMessageResponse
        {
            Id = message.Id,
            ChatId = message.ChatId,
            UserId = message.UserId,
            UserName = GetDisplayName(sender),
            UserAvatarUrl = sender.AvatarUrl,
            Text = message.Text,
            SentAt = message.SentAt,
            ReplyToMessageId = null,
            ReplyToUserName = null,
            ReplyToText = null,
            SharedFishingEntryId = null,
            SharedFishingEntry = null,
            IsDeleted = false,
            IsDeletedForAll = false,
            IsReadByOthers = false,
            Attachments = new List<ChatMessageAttachmentResponse>()
        };

        await _chatHub.Clients
            .Group($"chat_{chat.Id}")
            .SendAsync("ReceiveMessage", response);

        foreach (var admin in admins)
        {
            if (admin.Id == sender.Id)
                continue;

            await _chatHub.Clients
                .Group($"user_{admin.Id}")
                .SendAsync("ChatNotificationChanged", new
                {
                    chatId = chat.Id,
                    messageId = message.Id,
                    senderUserId = sender.Id,
                    senderName = title,
                    chatName = chat.Name,
                    messagePreview = title,
                    isMuted = false,
                    updatedAtUtc = now
                });
        }
    }

    private async Task<bool> HasSubmittedBlockAppealAsync(AppUser user)
    {
        if (!user.IsBlocked)
            return false;

        var displayName = GetDisplayName(user);
        var chatName = $"Обращение по блокировке: {displayName}";
        var chatDescription = $"Служебный чат для рассмотрения обращения пользователя {displayName}.";
        var blockedAtUtc = user.BlockedAtUtc ?? DateTime.MinValue;

        return await _context.ChatMessages
            .AsNoTracking()
            .AnyAsync(message =>
                message.UserId == user.Id &&
                message.SentAt >= blockedAtUtc &&
                message.Chat.Type == ChatType.Group &&
                message.Chat.Name == chatName &&
                message.Chat.Description == chatDescription);
    }

    private async Task NotifyNavigationChangedAsync(Guid currentUserId, Guid targetUserId, string reason)
    {
        var now = DateTime.UtcNow;

        var recipientIds = reason is "user-blocked" or "user-unblocked"
            ? new[] { currentUserId }
            : new[] { currentUserId, targetUserId }.Distinct();

        foreach (var userId in recipientIds)
        {
            await _chatHub.Clients
                .Group($"user_{userId}")
                .SendAsync("ChatNotificationChanged", new
                {
                    reason,
                    actorUserId = currentUserId,
                    targetUserId,
                    isService = true,
                    updatedAtUtc = now
                });
        }
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrWhiteSpace(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return null;

        return userId;
    }

    private async Task<bool> IsCurrentUserAdminAsync(Guid userId)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString());
        return user != null && await _userManager.IsInRoleAsync(user, "Admin");
    }

    private static ProfileResponse ToProfileResponse(AppUser user, Guid? currentUserId = null, bool currentUserIsAdmin = false)
    {
        return new ProfileResponse
        {
            Id = user.Id,
            UserName = user.UserName ?? string.Empty,
            FirstName = user.FirstName,
            LastName = user.LastName,
            DisplayName = GetDisplayName(user),
            Email = user.Email ?? string.Empty,
            Region = user.IsBlocked ? null : user.Region,
            About = user.IsBlocked ? null : user.About,
            AvatarUrl = user.IsBlocked ? null : user.AvatarUrl,
            CreatedAt = user.CreatedAt,
            IsBlocked = user.IsBlocked,
            BlockReasonCode = (currentUserIsAdmin || currentUserId == user.Id) ? user.BlockReasonCode : null,
            BlockReasonText = (currentUserIsAdmin || currentUserId == user.Id) ? GetBlockReasonDisplayText(user) : null,
            BlockedAtUtc = (currentUserIsAdmin || currentUserId == user.Id) ? user.BlockedAtUtc : null,
            BlockAppealSubmitted = false,
            ChatToastsEnabled = user.ChatToastsEnabled,
            HideChatMessageTextInNotifications = user.HideChatMessageTextInNotifications
        };
    }


    private static (string? ReasonCode, string? ReasonText, string? ErrorMessage) NormalizeBlockReason(AdminBlockUserRequest? request)
    {
        var reasonCode = (request?.ReasonCode ?? request?.Reason ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(reasonCode))
            return (null, null, "Выберите причину блокировки.");

        if (!BlockReasonLabels.ContainsKey(reasonCode))
            return (null, null, "Некорректная причина блокировки.");

        var reasonText = NormalizeOptionalText(request?.ReasonText, MaxBlockReasonTextLength);

        if (reasonCode == "other" && string.IsNullOrWhiteSpace(reasonText))
            return (null, null, "Укажите текст причины блокировки.");

        return (reasonCode, reasonText, null);
    }

    private static string? GetBlockReasonDisplayText(AppUser user)
    {
        if (!user.IsBlocked)
            return null;

        string? label = null;
        var hasLabel = !string.IsNullOrWhiteSpace(user.BlockReasonCode) &&
                       BlockReasonLabels.TryGetValue(user.BlockReasonCode, out label);

        if (!string.IsNullOrWhiteSpace(user.BlockReasonText))
        {
            return hasLabel &&
                   !string.IsNullOrWhiteSpace(label) &&
                   !string.Equals(user.BlockReasonCode, "other", StringComparison.OrdinalIgnoreCase)
                ? $"{label}. {user.BlockReasonText}"
                : user.BlockReasonText;
        }

        return hasLabel && !string.IsNullOrWhiteSpace(label)
            ? label
            : "Нарушение правил сервиса";
    }

    private static string GetDisplayName(AppUser user)
    {
        var fullName = $"{user.FirstName} {user.LastName}".Trim();

        return string.IsNullOrWhiteSpace(fullName)
            ? user.UserName ?? "Пользователь"
            : fullName;
    }

    private static string NormalizeUserName(string userName)
    {
        return userName.Trim().TrimStart('@').ToLowerInvariant();
    }

    private static string NormalizeRequiredText(string? value, int maxLength)
    {
        var normalized = value?.Trim() ?? string.Empty;
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string? NormalizeOptionalText(string? value, int maxLength)
    {
        var normalized = value?.Trim();

        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static bool IsUserNameValid(string userName)
    {
        return Regex.IsMatch(userName, @"^[a-zA-Z0-9._]{3,30}$");
    }
}

public class SubmitBlockAppealRequest
{
    public string? Message { get; set; }
}

public class AdminBlockUserRequest
{
    public string? Reason { get; set; }
    public string? ReasonCode { get; set; }
    public string? ReasonText { get; set; }
}


public class UserReportRequest
{
    public string? Reason { get; set; }
    public string? ReasonCode { get; set; }
    public string? ReasonText { get; set; }
}
