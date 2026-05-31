using System.Text.RegularExpressions;
using System.Security.Claims;
using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using FishingApp.Api.DTOs.Profile;
using FishingApp.Api.DTOs.FishingEntries;
using FishingApp.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
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

    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _context;

    public ProfileController(
        UserManager<AppUser> userManager,
        AppDbContext context)
    {
        _userManager = userManager;
        _context = context;
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

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        return Ok(ToProfileResponse(user));
    }

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> GetPublicProfile(Guid userId)
    {
        var user = await _userManager.Users
            .FirstOrDefaultAsync(x => x.Id == userId);

        if (user == null || user.IsBlocked)
            return NotFound(new { message = "Пользователь не найден." });

        var entries = await _context.FishingEntries
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
            FirstName = user.FirstName,
            LastName = user.LastName,
            DisplayName = GetDisplayName(user),
            Region = user.Region,
            About = user.About,
            AvatarUrl = user.AvatarUrl,
            CreatedAt = user.CreatedAt,
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

    private static ProfileResponse ToProfileResponse(AppUser user)
    {
        return new ProfileResponse
        {
            Id = user.Id,
            UserName = user.UserName ?? string.Empty,
            FirstName = user.FirstName,
            LastName = user.LastName,
            DisplayName = GetDisplayName(user),
            Email = user.Email ?? string.Empty,
            Region = user.Region,
            About = user.About,
            AvatarUrl = user.AvatarUrl,
            CreatedAt = user.CreatedAt,
            ChatToastsEnabled = user.ChatToastsEnabled,
            HideChatMessageTextInNotifications = user.HideChatMessageTextInNotifications
        };
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
