using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using FishingApp.Api.DTOs.FishingEntries;
using FishingApp.Api.Hubs;
using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using FishingApp.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FishingApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FishingEntriesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IHubContext<ChatHub> _chatHub;

    public FishingEntriesController(
        AppDbContext context,
        IHttpClientFactory httpClientFactory,
        IHubContext<ChatHub> chatHub)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _chatHub = chatHub;
    }

    [HttpGet]
    public async Task<IActionResult> GetMyEntries()
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var entries = (await _context.FishingEntries
            .Include(x => x.Media)
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.FishingStartedAt)
            .ThenByDescending(x => x.FishingDate)
            .ToListAsync())
            .Select(ToResponse)
            .ToList();

        return Ok(entries);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var entry = await _context.FishingEntries
            .Include(x => x.Media)
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);

        if (entry == null)
            return NotFound(new { message = "Запись не найдена." });

        return Ok(ToResponse(entry));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateFishingEntryRequest request)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var mediaValidationError = ValidateMediaRequest(request.Media);
        if (mediaValidationError != null)
            return mediaValidationError;

        var startedAt = request.FishingStartedAt ?? request.FishingDate;

        if (startedAt == null)
            return BadRequest(new { message = "Укажите начало рыбалки." });

        var startedAtUtc = EnsureUtc(startedAt.Value);
        var endedAtUtc = EnsureUtc(request.FishingEndedAt);

        if (endedAtUtc.HasValue && endedAtUtc.Value < startedAtUtc)
            return BadRequest(new { message = "Время окончания рыбалки не может быть раньше начала." });

        var weatherSummary = await BuildWeatherSummaryAsync(
            request.Latitude,
            request.Longitude,
            startedAtUtc,
            endedAtUtc);

        var entry = new FishingEntry
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = request.Title,
            Description = request.Description,
            FishingDate = startedAtUtc,
            FishingStartedAt = startedAtUtc,
            FishingEndedAt = endedAtUtc,
            LocationName = request.LocationName,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            CatchType = request.CatchType,
            CatchWeight = request.CatchWeight,
            Bait = request.Bait,
            WeatherSummary = weatherSummary,
            PhotoUrl = request.PhotoUrl ?? GetPrimaryImageUrl(request.Media),
            Media = BuildMediaEntities(request.Media),
            CreatedAt = DateTime.UtcNow,
            Visibility = request.Visibility,
            IsPublishedToFeed = request.Visibility == FishingEntryVisibility.PublicProfile && request.IsPublishedToFeed,
        };

        _context.FishingEntries.Add(entry);
        await _context.SaveChangesAsync();

        return Ok(ToResponse(entry));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateFishingEntryRequest request)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var mediaValidationError = ValidateMediaRequest(request.Media);
        if (mediaValidationError != null)
            return mediaValidationError;

        var entry = await _context.FishingEntries
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);

        if (entry == null)
            return NotFound(new { message = "Запись не найдена." });

        var startedAt = request.FishingStartedAt ?? request.FishingDate;

        if (startedAt == null)
            return BadRequest(new { message = "Укажите начало рыбалки." });

        var startedAtUtc = EnsureUtc(startedAt.Value);
        var endedAtUtc = EnsureUtc(request.FishingEndedAt);

        if (endedAtUtc.HasValue && endedAtUtc.Value < startedAtUtc)
            return BadRequest(new { message = "Время окончания рыбалки не может быть раньше начала." });

        entry.Title = request.Title;
        entry.Description = request.Description;
        entry.FishingDate = startedAtUtc;
        entry.FishingStartedAt = startedAtUtc;
        entry.FishingEndedAt = endedAtUtc;
        entry.LocationName = request.LocationName;
        entry.Latitude = request.Latitude;
        entry.Longitude = request.Longitude;
        entry.CatchType = request.CatchType;
        entry.CatchWeight = request.CatchWeight;
        entry.Bait = request.Bait;
        entry.PhotoUrl = request.PhotoUrl ?? GetPrimaryImageUrl(request.Media);

        await _context.Set<FishingEntryMedia>()
            .Where(x => x.FishingEntryId == entry.Id)
            .ExecuteDeleteAsync();

        var newMedia = BuildMediaEntities(request.Media);
        foreach (var media in newMedia)
        {
            media.FishingEntryId = entry.Id;
        }

        if (newMedia.Count > 0)
        {
            await _context.Set<FishingEntryMedia>().AddRangeAsync(newMedia);
        }

        entry.Visibility = request.Visibility;
        entry.IsPublishedToFeed = request.Visibility == FishingEntryVisibility.PublicProfile && request.IsPublishedToFeed;

        // Погоду пересчитываем автоматически при каждом сохранении, потому что могли измениться координаты или время.
        entry.WeatherSummary = await BuildWeatherSummaryAsync(
            request.Latitude,
            request.Longitude,
            startedAtUtc,
            endedAtUtc);

        await _context.SaveChangesAsync();

        var updatedEntry = await _context.FishingEntries
            .Include(x => x.Media)
            .FirstAsync(x => x.Id == entry.Id);

        return Ok(ToResponse(updatedEntry));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var entry = await _context.FishingEntries
            .Include(x => x.Media)
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);

        if (entry == null)
            return NotFound(new { message = "Запись не найдена." });

        _context.FishingEntries.Remove(entry);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Запись удалена." });
    }

    [AllowAnonymous]
    [HttpGet("feed")]
    public async Task<IActionResult> GetFeed(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? sort = "new",
        [FromQuery] string? region = null,
        [FromQuery] string? fish = null,
        [FromQuery] Guid? entryId = null)
    {
        var userIdResult = GetCurrentUserId();
        var currentUserId = userIdResult;

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 30);

        var query = _context.FishingEntries
            .AsNoTracking()
            .Include(x => x.User)
            .Where(x => x.Visibility == FishingEntryVisibility.PublicProfile && x.IsPublishedToFeed);

        if (!string.IsNullOrWhiteSpace(region))
        {
            var normalizedRegion = region.Trim().ToLower();
            query = query.Where(x => x.LocationName != null && x.LocationName.ToLower().Contains(normalizedRegion));
        }

        if (!string.IsNullOrWhiteSpace(fish))
        {
            var normalizedFish = fish.Trim().ToLower();
            query = query.Where(x => x.CatchType != null && x.CatchType.ToLower() == normalizedFish);
        }

        var projected = query.Select(x => new FishingEntryResponse
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
            CreatedAt = x.CreatedAt,
            UserId = x.UserId,
            UserName = x.User.UserName,
            AvatarUrl = x.User.AvatarUrl,
            LikesCount = _context.FishingEntryLikes.Count(like => like.FishingEntryId == x.Id),
            CommentsCount = _context.FishingEntryComments.Count(comment => comment.FishingEntryId == x.Id),
            SharesCount = _context.FishingEntryShares.Count(share => share.FishingEntryId == x.Id),
            IsLikedByCurrentUser = currentUserId.HasValue && _context.FishingEntryLikes.Any(like => like.FishingEntryId == x.Id && like.UserId == currentUserId.Value)
        });

        var totalCount = await projected.CountAsync();

        projected = string.Equals(sort, "popular", StringComparison.OrdinalIgnoreCase)
            ? projected
                .OrderByDescending(x => x.LikesCount + x.CommentsCount * 2 + x.SharesCount)
                .ThenByDescending(x => x.CreatedAt)
            : projected.OrderByDescending(x => x.CreatedAt);

        var items = await projected
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        // Если пользователь открыл запись из чата, нужно быстро показать её,
        // даже если она находится не на первой странице ленты.
        if (page == 1 && entryId.HasValue && items.All(x => x.Id != entryId.Value))
        {
            var targetEntry = await _context.FishingEntries
                .AsNoTracking()
                .Include(x => x.User)
                .Where(x =>
                    x.Id == entryId.Value &&
                    x.Visibility == FishingEntryVisibility.PublicProfile &&
                    x.IsPublishedToFeed)
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
                    CreatedAt = x.CreatedAt,
                    UserId = x.UserId,
                    UserName = x.User.UserName,
                    AvatarUrl = x.User.AvatarUrl,
                    LikesCount = _context.FishingEntryLikes.Count(like => like.FishingEntryId == x.Id),
                    CommentsCount = _context.FishingEntryComments.Count(comment => comment.FishingEntryId == x.Id),
                    SharesCount = _context.FishingEntryShares.Count(share => share.FishingEntryId == x.Id),
                    IsLikedByCurrentUser = currentUserId.HasValue && _context.FishingEntryLikes.Any(like => like.FishingEntryId == x.Id && like.UserId == currentUserId.Value)
                })
                .FirstOrDefaultAsync();

            if (targetEntry != null)
                items.Insert(0, targetEntry);
        }

        return Ok(new FishingFeedPageResponse
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
            HasMore = page * pageSize < totalCount
        });
    }

    [HttpPost("{id:guid}/like")]
    public async Task<IActionResult> ToggleLike(Guid id)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var entry = await _context.FishingEntries
            .AsNoTracking()
            .Where(x => x.Id == id && x.Visibility == FishingEntryVisibility.PublicProfile && x.IsPublishedToFeed)
            .Select(x => new
            {
                x.Id,
                x.UserId,
                x.Title
            })
            .FirstOrDefaultAsync();

        if (entry == null)
            return NotFound(new { message = "Запись не найдена или не опубликована в ленте." });

        var existingLike = await _context.FishingEntryLikes
            .FirstOrDefaultAsync(x => x.FishingEntryId == id && x.UserId == userId);

        var isLiked = existingLike == null;

        if (existingLike == null)
        {
            _context.FishingEntryLikes.Add(new FishingEntryLike
            {
                Id = Guid.NewGuid(),
                FishingEntryId = id,
                UserId = userId,
                CreatedAt = DateTime.UtcNow
            });
        }
        else
        {
            _context.FishingEntryLikes.Remove(existingLike);
        }

        await _context.SaveChangesAsync();

        var likesCount = await _context.FishingEntryLikes
            .CountAsync(x => x.FishingEntryId == id);

        if (isLiked && entry.UserId != userId)
        {
            await NotifyEntryOwnerAsync(
                entry.UserId,
                "fishing-entry-like",
                id,
                userId,
                "Новый лайк",
                $"{await GetUserDisplayNameAsync(userId)} оценил вашу запись «{entry.Title}».");
        }

        return Ok(new
        {
            entryId = id,
            isLiked,
            likesCount
        });
    }

    [HttpGet("{id:guid}/comments")]
    public async Task<IActionResult> GetComments(Guid id)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var entry = await _context.FishingEntries
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && x.Visibility == FishingEntryVisibility.PublicProfile && x.IsPublishedToFeed);

        if (entry == null)
            return NotFound(new { message = "Запись не найдена или не опубликована в ленте." });

        var comments = await _context.FishingEntryComments
            .Include(x => x.User)
            .Include(x => x.ParentComment)
                .ThenInclude(x => x.User)
            .Where(x => x.FishingEntryId == id)
            .OrderBy(x => x.CreatedAt)
            .Select(x => new FishingEntryCommentResponse
            {
                Id = x.Id,
                FishingEntryId = x.FishingEntryId,
                UserId = x.UserId,
                UserName = x.User.UserName ?? string.Empty,
                AvatarUrl = x.User.AvatarUrl,
                ParentCommentId = x.ParentCommentId,
                ParentUserName = x.ParentComment != null ? x.ParentComment.User.UserName : null,
                Text = x.Text,
                CreatedAt = x.CreatedAt,
                UpdatedAt = x.UpdatedAt,
                CanEdit = x.UserId == userId || entry.UserId == userId
            })
            .ToListAsync();

        return Ok(comments);
    }

    [HttpPost("{id:guid}/comments")]
    public async Task<IActionResult> CreateComment(Guid id, CreateFishingEntryCommentRequest request)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;
        var text = NormalizeCommentText(request.Text);

        if (string.IsNullOrWhiteSpace(text))
            return BadRequest(new { message = "Комментарий не может быть пустым." });

        var entry = await _context.FishingEntries
            .AsNoTracking()
            .Where(x => x.Id == id && x.Visibility == FishingEntryVisibility.PublicProfile && x.IsPublishedToFeed)
            .Select(x => new
            {
                x.Id,
                x.UserId,
                x.Title
            })
            .FirstOrDefaultAsync();

        if (entry == null)
            return NotFound(new { message = "Запись не найдена или не опубликована в ленте." });

        if (request.ParentCommentId.HasValue)
        {
            var parentExists = await _context.FishingEntryComments
                .AnyAsync(x => x.Id == request.ParentCommentId.Value && x.FishingEntryId == id && x.ParentCommentId == null);

            if (!parentExists)
                return BadRequest(new { message = "Комментарий для ответа не найден." });
        }

        var comment = new FishingEntryComment
        {
            Id = Guid.NewGuid(),
            FishingEntryId = id,
            UserId = userId,
            ParentCommentId = request.ParentCommentId,
            Text = text,
            CreatedAt = DateTime.UtcNow
        };

        _context.FishingEntryComments.Add(comment);
        await _context.SaveChangesAsync();

        var response = await _context.FishingEntryComments
            .Include(x => x.User)
            .Include(x => x.ParentComment)
                .ThenInclude(x => x.User)
            .Where(x => x.Id == comment.Id)
            .Select(x => new FishingEntryCommentResponse
            {
                Id = x.Id,
                FishingEntryId = x.FishingEntryId,
                UserId = x.UserId,
                UserName = x.User.UserName ?? string.Empty,
                AvatarUrl = x.User.AvatarUrl,
                ParentCommentId = x.ParentCommentId,
                ParentUserName = x.ParentComment != null ? x.ParentComment.User.UserName : null,
                Text = x.Text,
                CreatedAt = x.CreatedAt,
                UpdatedAt = x.UpdatedAt,
                CanEdit = true
            })
            .FirstAsync();

        var commentsCount = await _context.FishingEntryComments
            .CountAsync(x => x.FishingEntryId == id);

        if (entry.UserId != userId)
        {
            await NotifyEntryOwnerAsync(
                entry.UserId,
                "fishing-entry-comment",
                id,
                userId,
                "Новый комментарий",
                $"{response.UserName} написал комментарий к записи «{entry.Title}».");
        }

        return Ok(new
        {
            comment = response,
            commentsCount
        });
    }

    [HttpPut("{id:guid}/comments/{commentId:guid}")]
    public async Task<IActionResult> UpdateComment(Guid id, Guid commentId, UpdateFishingEntryCommentRequest request)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;
        var text = NormalizeCommentText(request.Text);

        if (string.IsNullOrWhiteSpace(text))
            return BadRequest(new { message = "Комментарий не может быть пустым." });

        var comment = await _context.FishingEntryComments
            .FirstOrDefaultAsync(x => x.Id == commentId && x.FishingEntryId == id);

        if (comment == null)
            return NotFound(new { message = "Комментарий не найден." });

        if (comment.UserId != userId)
            return Forbid();

        comment.Text = text;
        comment.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return Ok(new { message = "Комментарий обновлён." });
    }

    [HttpDelete("{id:guid}/comments/{commentId:guid}")]
    public async Task<IActionResult> DeleteComment(Guid id, Guid commentId)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var comment = await _context.FishingEntryComments
            .Include(x => x.FishingEntry)
            .FirstOrDefaultAsync(x => x.Id == commentId && x.FishingEntryId == id);

        if (comment == null)
            return NotFound(new { message = "Комментарий не найден." });

        var isCommentAuthor = comment.UserId == userId;
        var isEntryAuthor = comment.FishingEntry.UserId == userId;

        if (!isCommentAuthor && !isEntryAuthor)
            return Forbid();

        var replies = await _context.FishingEntryComments
            .Where(x => x.ParentCommentId == comment.Id)
            .ToListAsync();

        if (replies.Count > 0)
            _context.FishingEntryComments.RemoveRange(replies);

        _context.FishingEntryComments.Remove(comment);
        await _context.SaveChangesAsync();

        var commentsCount = await _context.FishingEntryComments
            .CountAsync(x => x.FishingEntryId == id);

        return Ok(new
        {
            message = "Комментарий удалён.",
            commentsCount
        });
    }

    [HttpPost("{id:guid}/share")]
    public async Task<IActionResult> Share(Guid id)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var entryExists = await _context.FishingEntries
            .AnyAsync(x => x.Id == id && x.Visibility == FishingEntryVisibility.PublicProfile && x.IsPublishedToFeed);

        if (!entryExists)
            return NotFound(new { message = "Запись не найдена или не опубликована в ленте." });

        _context.FishingEntryShares.Add(new FishingEntryShare
        {
            Id = Guid.NewGuid(),
            FishingEntryId = id,
            UserId = userId,
            CreatedAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();

        var sharesCount = await _context.FishingEntryShares
            .CountAsync(x => x.FishingEntryId == id);

        return Ok(new
        {
            entryId = id,
            sharesCount
        });
    }

    [HttpPost("{id:guid}/refresh-weather")]
    public async Task<IActionResult> RefreshWeather(Guid id)
    {
        var userIdResult = GetCurrentUserId();
        if (userIdResult == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var userId = userIdResult.Value;

        var entry = await _context.FishingEntries
            .Include(x => x.Media)
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);

        if (entry == null)
            return NotFound(new { message = "Запись не найдена." });

        entry.WeatherSummary = await BuildWeatherSummaryAsync(
            entry.Latitude,
            entry.Longitude,
            entry.FishingStartedAt == default ? entry.FishingDate : entry.FishingStartedAt,
            entry.FishingEndedAt);

        await _context.SaveChangesAsync();

        return Ok(ToResponse(entry));
    }


    private static DateTime EnsureUtc(DateTime value)
    {
        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
    }

    private static DateTime? EnsureUtc(DateTime? value)
    {
        return value.HasValue ? EnsureUtc(value.Value) : null;
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return null;

        return userId;
    }

    private static FishingEntryResponse ToResponse(FishingEntry x)
    {
        var startedAt = x.FishingStartedAt == default ? x.FishingDate : x.FishingStartedAt;

        return new FishingEntryResponse
        {
            Id = x.Id,
            Title = x.Title,
            Description = x.Description,
            FishingDate = x.FishingDate,
            FishingStartedAt = startedAt,
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
            CreatedAt = x.CreatedAt,
            UserId = x.UserId
        };
    }



    private BadRequestObjectResult? ValidateMediaRequest(List<FishingEntryMediaRequest>? media)
    {
        if (media == null || media.Count == 0)
            return null;

        var filledMedia = media
            .Where(x => !string.IsNullOrWhiteSpace(x.Url))
            .ToList();

        if (filledMedia.Count > 10)
            return BadRequest(new { message = "К одной записи можно прикрепить не больше 10 файлов." });

        foreach (var item in filledMedia)
        {
            var mediaType = NormalizeMediaType(item.MediaType);
            var url = item.Url.Trim();

            if (!IsLocalFishingUploadUrl(url))
                return BadRequest(new { message = "К записи можно прикреплять только файлы, загруженные через приложение." });

            var extension = Path.GetExtension(GetPathFromUrl(url)).ToLowerInvariant();

            if (mediaType == "image" && !IsAllowedImageExtension(extension))
                return BadRequest(new { message = "Для фото разрешены только jpg, jpeg, png, webp." });

            if (mediaType == "video" && !IsAllowedVideoExtension(extension))
                return BadRequest(new { message = "Для видео разрешены только mp4, webm, mov, m4v." });
        }

        return null;
    }

    private static bool IsLocalFishingUploadUrl(string url)
    {
        var path = GetPathFromUrl(url);

        return path.StartsWith("/uploads/fishing/", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetPathFromUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var absoluteUri))
            return absoluteUri.AbsolutePath;

        if (Uri.TryCreate(url, UriKind.Relative, out var relativeUri))
            return relativeUri.OriginalString;

        return string.Empty;
    }

    private static bool IsAllowedImageExtension(string extension)
    {
        return extension is ".jpg" or ".jpeg" or ".png" or ".webp";
    }

    private static bool IsAllowedVideoExtension(string extension)
    {
        return extension is ".mp4" or ".webm" or ".mov" or ".m4v";
    }


    private static List<FishingEntryMedia> BuildMediaEntities(List<FishingEntryMediaRequest>? media)
    {
        if (media == null || media.Count == 0)
            return new List<FishingEntryMedia>();

        return media
            .Where(x => !string.IsNullOrWhiteSpace(x.Url))
            .Select((x, index) => new FishingEntryMedia
            {
                Id = Guid.NewGuid(),
                Url = x.Url.Trim(),
                MediaType = NormalizeMediaType(x.MediaType),
                SortOrder = x.SortOrder != 0 ? x.SortOrder : index,
                CreatedAt = DateTime.UtcNow
            })
            .ToList();
    }

    private static List<FishingEntryMediaResponse> ToMediaResponses(IEnumerable<FishingEntryMedia>? media)
    {
        if (media == null)
            return new List<FishingEntryMediaResponse>();

        return media
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.CreatedAt)
            .Select(x => new FishingEntryMediaResponse
            {
                Id = x.Id,
                Url = x.Url,
                MediaType = NormalizeMediaType(x.MediaType),
                SortOrder = x.SortOrder
            })
            .ToList();
    }

    private static string? GetPrimaryImageUrl(List<FishingEntryMediaRequest>? media)
    {
        return media?
            .Where(x => !string.IsNullOrWhiteSpace(x.Url))
            .OrderBy(x => x.SortOrder)
            .FirstOrDefault(x => string.Equals(NormalizeMediaType(x.MediaType), "image", StringComparison.OrdinalIgnoreCase))
            ?.Url
            .Trim();
    }

    private static string NormalizeMediaType(string? value)
    {
        return string.Equals(value, "video", StringComparison.OrdinalIgnoreCase)
            ? "video"
            : "image";
    }

    private async Task NotifyEntryOwnerAsync(
        Guid ownerUserId,
        string reason,
        Guid entryId,
        Guid actorUserId,
        string title,
        string message)
    {
        await _chatHub.Clients
            .Group(ChatHub.GetUserGroupName(ownerUserId))
            .SendAsync("NavigationNotificationChanged", new
            {
                reason,
                entryId,
                actorUserId,
                actorName = await GetUserDisplayNameAsync(actorUserId),
                title,
                message,
                updatedAtUtc = DateTime.UtcNow
            });
    }

    private async Task<string> GetUserDisplayNameAsync(Guid userId)
    {
        var userName = await _context.Users
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => x.UserName)
            .FirstOrDefaultAsync();

        return string.IsNullOrWhiteSpace(userName) ? "Пользователь" : userName;
    }

    private static string NormalizeCommentText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var text = value.Trim();
        return text.Length <= 1000 ? text : text[..1000];
    }

    private async Task<string?> BuildWeatherSummaryAsync(
        double? latitude,
        double? longitude,
        DateTime startedAt,
        DateTime? endedAt)
    {
        if (latitude == null || longitude == null)
            return null;

        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
            return null;

        try
        {
            var end = endedAt ?? startedAt;
            if (end < startedAt)
                end = startedAt;

            var startDate = DateOnly.FromDateTime(startedAt);
            var endDate = DateOnly.FromDateTime(end);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var isHistorical = startDate < today;

            var client = _httpClientFactory.CreateClient();
            var latString = latitude.Value.ToString(CultureInfo.InvariantCulture);
            var lonString = longitude.Value.ToString(CultureInfo.InvariantCulture);
            var startDateString = startDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var endDateString = endDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

            var baseUrl = isHistorical
                ? "https://archive-api.open-meteo.com/v1/archive"
                : "https://api.open-meteo.com/v1/forecast";

            var url =
                $"{baseUrl}" +
                $"?latitude={latString}" +
                $"&longitude={lonString}" +
                $"&start_date={startDateString}" +
                $"&end_date={endDateString}" +
                $"&hourly=temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,precipitation,weather_code" +
                $"&timezone=auto" +
                $"&wind_speed_unit=ms";

            var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
                return null;

            var raw = await response.Content.ReadAsStringAsync();
            if (string.IsNullOrWhiteSpace(raw))
                return null;

            using var doc = JsonDocument.Parse(raw);
            if (!doc.RootElement.TryGetProperty("hourly", out var hourly))
                return null;

            var times = ReadDateTimeArray(hourly, "time");
            var temperatures = ReadDoubleArray(hourly, "temperature_2m");
            var winds = ReadDoubleArray(hourly, "wind_speed_10m");
            var precipitations = ReadDoubleArray(hourly, "precipitation");
            var codes = ReadIntArray(hourly, "weather_code");

            if (times.Count == 0)
                return null;

            var selectedIndexes = times
                .Select((time, index) => new { time, index })
                .Where(x => x.time >= startedAt && x.time <= end)
                .Select(x => x.index)
                .ToList();

            if (selectedIndexes.Count == 0)
            {
                var midpoint = startedAt.AddTicks((end - startedAt).Ticks / 2);
                var nearest = times
                    .Select((time, index) => new { index, distance = Math.Abs((time - midpoint).TotalMinutes) })
                    .OrderBy(x => x.distance)
                    .FirstOrDefault();

                if (nearest != null)
                    selectedIndexes.Add(nearest.index);
            }

            if (selectedIndexes.Count == 0)
                return null;

            var avgTemperature = AverageByIndexes(temperatures, selectedIndexes);
            var avgWind = AverageByIndexes(winds, selectedIndexes);
            var precipitationSum = SumByIndexes(precipitations, selectedIndexes);
            var weatherCode = MostFrequentByIndexes(codes, selectedIndexes);
            var description = GetWeatherDescription(weatherCode);

            var parts = new List<string>();

            if (!string.IsNullOrWhiteSpace(description))
                parts.Add(description);

            if (avgTemperature != null)
                parts.Add($"{avgTemperature.Value.ToString("0.#", CultureInfo.InvariantCulture)}°C");

            if (avgWind != null)
                parts.Add($"ветер {avgWind.Value.ToString("0.#", CultureInfo.InvariantCulture)} м/с");

            if (precipitationSum != null && precipitationSum.Value > 0)
                parts.Add($"осадки {precipitationSum.Value.ToString("0.#", CultureInfo.InvariantCulture)} мм");

            return parts.Count == 0 ? null : string.Join(", ", parts);
        }
        catch
        {
            // Запись не должна ломаться только из-за погоды.
            return null;
        }
    }

    private static List<DateTime> ReadDateTimeArray(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var array) || array.ValueKind != JsonValueKind.Array)
            return new List<DateTime>();

        var result = new List<DateTime>();
        foreach (var item in array.EnumerateArray())
        {
            if (DateTime.TryParse(item.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var value))
                result.Add(value);
        }

        return result;
    }

    private static List<double?> ReadDoubleArray(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var array) || array.ValueKind != JsonValueKind.Array)
            return new List<double?>();

        var result = new List<double?>();
        foreach (var item in array.EnumerateArray())
        {
            result.Add(item.ValueKind == JsonValueKind.Number && item.TryGetDouble(out var value) ? value : null);
        }

        return result;
    }

    private static List<int?> ReadIntArray(JsonElement parent, string propertyName)
    {
        if (!parent.TryGetProperty(propertyName, out var array) || array.ValueKind != JsonValueKind.Array)
            return new List<int?>();

        var result = new List<int?>();
        foreach (var item in array.EnumerateArray())
        {
            result.Add(item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var value) ? value : null);
        }

        return result;
    }

    private static double? AverageByIndexes(List<double?> values, List<int> indexes)
    {
        var selected = indexes
            .Where(i => i >= 0 && i < values.Count && values[i].HasValue)
            .Select(i => values[i]!.Value)
            .ToList();

        return selected.Count == 0 ? null : selected.Average();
    }

    private static double? SumByIndexes(List<double?> values, List<int> indexes)
    {
        var selected = indexes
            .Where(i => i >= 0 && i < values.Count && values[i].HasValue)
            .Select(i => values[i]!.Value)
            .ToList();

        return selected.Count == 0 ? null : selected.Sum();
    }

    private static int? MostFrequentByIndexes(List<int?> values, List<int> indexes)
    {
        return indexes
            .Where(i => i >= 0 && i < values.Count && values[i].HasValue)
            .Select(i => values[i]!.Value)
            .GroupBy(x => x)
            .OrderByDescending(x => x.Count())
            .Select(x => (int?)x.Key)
            .FirstOrDefault();
    }

    private static string GetWeatherDescription(int? code)
    {
        return code switch
        {
            0 => "Ясно",
            1 => "Преимущественно ясно",
            2 => "Переменная облачность",
            3 => "Пасмурно",
            45 => "Туман",
            48 => "Изморозный туман",
            51 => "Слабая морось",
            53 => "Умеренная морось",
            55 => "Сильная морось",
            61 => "Слабый дождь",
            63 => "Умеренный дождь",
            65 => "Сильный дождь",
            71 => "Слабый снег",
            73 => "Умеренный снег",
            75 => "Сильный снег",
            80 => "Кратковременный слабый ливень",
            81 => "Кратковременный умеренный ливень",
            82 => "Кратковременный сильный ливень",
            95 => "Гроза",
            96 => "Гроза со слабым градом",
            99 => "Гроза с сильным градом",
            _ => "Погода без описания"
        };
    }

    private static string? GetPreviewUrl(string? url)
    {
        return BuildOptimizedImageUrl(url, "preview");
    }

    private static string? GetThumbnailUrl(string? url)
    {
        return BuildOptimizedImageUrl(url, "thumb");
    }

    private static string? BuildOptimizedImageUrl(string? url, string suffix)
    {
        if (string.IsNullOrWhiteSpace(url))
            return null;

        var queryIndex = url.IndexOf('?', StringComparison.Ordinal);
        var cleanUrl = queryIndex >= 0 ? url[..queryIndex] : url;

        var extension = Path.GetExtension(cleanUrl);
        if (string.IsNullOrWhiteSpace(extension))
            return null;

        var withoutExtension = cleanUrl[..^extension.Length];
        return $"{withoutExtension}_{suffix}.webp";
    }


}
