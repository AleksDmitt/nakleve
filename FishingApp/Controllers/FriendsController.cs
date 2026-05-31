using System.Security.Claims;
using FishingApp.Api.DTOs.Friends;
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
public class FriendsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IHubContext<ChatHub> _chatHub;

    public FriendsController(AppDbContext context, IHubContext<ChatHub> chatHub)
    {
        _context = context;
        _chatHub = chatHub;
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return null;

        return Guid.TryParse(userIdClaim, out var userId) ? userId : null;
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchByUserName([FromQuery] string? userName)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var query = NormalizeUserName(userName);

        if (string.IsNullOrWhiteSpace(query))
            return Ok(Array.Empty<FriendUserResponse>());

        if (query.Length < 2)
            return Ok(Array.Empty<FriendUserResponse>());

        var users = await _context.Users
            .Where(x =>
                x.Id != currentUserId &&
                !x.IsBlocked &&
                x.UserName != null &&
                x.UserName.ToLower().Contains(query))
            .OrderBy(x => x.UserName)
            .Take(20)
            .ToListAsync();

        var userIds = users.Select(x => x.Id).ToList();

        var friendships = await _context.Friendships
            .Where(x =>
                userIds.Contains(x.RequesterId) && x.AddresseeId == currentUserId ||
                userIds.Contains(x.AddresseeId) && x.RequesterId == currentUserId)
            .ToListAsync();

        var result = users.Select(user =>
        {
            var friendship = friendships.FirstOrDefault(x =>
                (x.RequesterId == currentUserId && x.AddresseeId == user.Id) ||
                (x.RequesterId == user.Id && x.AddresseeId == currentUserId));

            return ToFriendUserResponse(user, currentUserId.Value, friendship);
        }).ToList();

        return Ok(result);
    }

    [HttpPost("request/{userId:guid}")]
    public async Task<IActionResult> SendRequest(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (currentUserId == userId)
            return BadRequest(new { message = "Нельзя добавить в друзья самого себя." });

        var targetUserExists = await _context.Users.AnyAsync(x => x.Id == userId && !x.IsBlocked);
        if (!targetUserExists)
            return NotFound(new { message = "Пользователь не найден." });

        var existingFriendship = await _context.Friendships.FirstOrDefaultAsync(x =>
            (x.RequesterId == currentUserId && x.AddresseeId == userId) ||
            (x.RequesterId == userId && x.AddresseeId == currentUserId));

        if (existingFriendship != null)
            return BadRequest(new { message = "Заявка или дружба уже существует." });

        var friendship = new Friendship
        {
            Id = Guid.NewGuid(),
            RequesterId = currentUserId.Value,
            AddresseeId = userId,
            Status = FriendshipStatus.Pending,
            CreatedAt = DateTime.UtcNow
        };

        _context.Friendships.Add(friendship);
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(userId, "friend-request-created");

        return Ok(new { message = "Заявка в друзья отправлена." });
    }

    [HttpPost("accept/{friendshipId:guid}")]
    public async Task<IActionResult> Accept(Guid friendshipId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var friendship = await _context.Friendships
            .FirstOrDefaultAsync(x =>
                x.Id == friendshipId &&
                x.AddresseeId == currentUserId &&
                x.Status == FriendshipStatus.Pending);

        if (friendship == null)
            return NotFound(new { message = "Заявка не найдена." });

        friendship.Status = FriendshipStatus.Accepted;
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(friendship.RequesterId, friendship.AddresseeId, "friend-request-accepted");

        return Ok(new { message = "Заявка принята." });
    }

    [HttpPost("decline/{friendshipId:guid}")]
    public async Task<IActionResult> Decline(Guid friendshipId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var friendship = await _context.Friendships
            .FirstOrDefaultAsync(x =>
                x.Id == friendshipId &&
                x.AddresseeId == currentUserId &&
                x.Status == FriendshipStatus.Pending);

        if (friendship == null)
            return NotFound(new { message = "Заявка не найдена." });

        var requesterId = friendship.RequesterId;
        var addresseeId = friendship.AddresseeId;

        _context.Friendships.Remove(friendship);
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(requesterId, addresseeId, "friend-request-declined");

        return Ok(new { message = "Заявка отклонена." });
    }

    [HttpDelete("{userId:guid}")]
    public async Task<IActionResult> RemoveFriend(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var friendship = await _context.Friendships
            .FirstOrDefaultAsync(x =>
                x.Status == FriendshipStatus.Accepted &&
                (
                    (x.RequesterId == currentUserId && x.AddresseeId == userId) ||
                    (x.RequesterId == userId && x.AddresseeId == currentUserId)
                ));

        if (friendship == null)
            return NotFound(new { message = "Друг не найден." });

        var requesterId = friendship.RequesterId;
        var addresseeId = friendship.AddresseeId;

        _context.Friendships.Remove(friendship);
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(requesterId, addresseeId, "friend-removed");

        return Ok(new { message = "Друг удалён." });
    }

    [HttpGet]
    public async Task<IActionResult> GetFriends()
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var friendships = await _context.Friendships
            .Include(x => x.Requester)
            .Include(x => x.Addressee)
            .Where(x =>
                x.Status == FriendshipStatus.Accepted &&
                (x.RequesterId == currentUserId || x.AddresseeId == currentUserId))
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

        var result = friendships.Select(x =>
        {
            var friend = x.RequesterId == currentUserId ? x.Addressee : x.Requester;
            return ToFriendUserResponse(friend, currentUserId.Value, x);
        }).ToList();

        return Ok(result);
    }

    [HttpGet("requests/incoming")]
    public async Task<IActionResult> GetIncomingRequests()
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var requests = await _context.Friendships
            .Include(x => x.Requester)
            .Where(x => x.AddresseeId == currentUserId && x.Status == FriendshipStatus.Pending)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new FriendRequestResponse
            {
                FriendshipId = x.Id,
                UserId = x.Requester.Id,
                UserName = x.Requester.UserName ?? string.Empty,
                FirstName = x.Requester.FirstName,
                LastName = x.Requester.LastName,
                DisplayName = GetDisplayName(x.Requester),
                AvatarUrl = x.Requester.AvatarUrl,
                Region = x.Requester.Region,
                CreatedAt = x.CreatedAt
            })
            .ToListAsync();

        return Ok(requests);
    }

    [HttpGet("status/{userId:guid}")]
    public async Task<IActionResult> GetStatus(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (currentUserId == userId)
        {
            return Ok(new FriendshipStatusResponse
            {
                IsFriend = false,
                IsIncomingRequest = false,
                IsOutgoingRequest = false,
                FriendshipId = null
            });
        }

        var friendship = await _context.Friendships.FirstOrDefaultAsync(x =>
            (x.RequesterId == currentUserId && x.AddresseeId == userId) ||
            (x.RequesterId == userId && x.AddresseeId == currentUserId));

        if (friendship == null)
        {
            return Ok(new FriendshipStatusResponse
            {
                IsFriend = false,
                IsIncomingRequest = false,
                IsOutgoingRequest = false,
                FriendshipId = null
            });
        }

        return Ok(new FriendshipStatusResponse
        {
            IsFriend = friendship.Status == FriendshipStatus.Accepted,
            IsIncomingRequest =
                friendship.Status == FriendshipStatus.Pending &&
                friendship.AddresseeId == currentUserId,
            IsOutgoingRequest =
                friendship.Status == FriendshipStatus.Pending &&
                friendship.RequesterId == currentUserId,
            FriendshipId = friendship.Id
        });
    }

    [HttpDelete("request/{userId:guid}")]
    public async Task<IActionResult> CancelOutgoingRequest(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var friendship = await _context.Friendships
            .FirstOrDefaultAsync(x =>
                x.RequesterId == currentUserId &&
                x.AddresseeId == userId &&
                x.Status == FriendshipStatus.Pending);

        if (friendship == null)
            return NotFound(new { message = "Исходящая заявка не найдена." });

        var requesterId = friendship.RequesterId;
        var addresseeId = friendship.AddresseeId;

        _context.Friendships.Remove(friendship);
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(requesterId, addresseeId, "friend-request-cancelled");

        return Ok(new { message = "Заявка отменена." });
    }


    private async Task NotifyNavigationChangedAsync(Guid userId, string reason)
    {
        await NotifyNavigationChangedAsync(new[] { userId }, reason);
    }

    private async Task NotifyNavigationChangedAsync(Guid firstUserId, Guid secondUserId, string reason)
    {
        await NotifyNavigationChangedAsync(new[] { firstUserId, secondUserId }, reason);
    }

    private async Task NotifyNavigationChangedAsync(IEnumerable<Guid> userIds, string reason)
    {
        var uniqueUserIds = userIds
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToList();

        foreach (var userId in uniqueUserIds)
        {
            await _chatHub.Clients
                .Group(ChatHub.GetUserGroupName(userId))
                .SendAsync("NavigationNotificationChanged", new
                {
                    reason,
                    updatedAtUtc = DateTime.UtcNow
                });
        }
    }

    private static FriendUserResponse ToFriendUserResponse(AppUser user, Guid currentUserId, Friendship? friendship)
    {
        return new FriendUserResponse
        {
            UserId = user.Id,
            UserName = user.UserName ?? string.Empty,
            FirstName = user.FirstName,
            LastName = user.LastName,
            DisplayName = GetDisplayName(user),
            AvatarUrl = user.AvatarUrl,
            Region = user.Region,
            FriendStatus = GetFriendStatus(currentUserId, friendship),
            FriendshipId = friendship?.Id
        };
    }

    private static string GetFriendStatus(Guid currentUserId, Friendship? friendship)
    {
        if (friendship == null)
            return "None";

        if (friendship.Status == FriendshipStatus.Accepted)
            return "Friends";

        if (friendship.Status == FriendshipStatus.Pending && friendship.RequesterId == currentUserId)
            return "OutgoingRequest";

        if (friendship.Status == FriendshipStatus.Pending && friendship.AddresseeId == currentUserId)
            return "IncomingRequest";

        return "None";
    }

    private static string GetDisplayName(AppUser user)
    {
        var fullName = $"{user.FirstName} {user.LastName}".Trim();

        return string.IsNullOrWhiteSpace(fullName)
            ? user.UserName ?? "Пользователь"
            : fullName;
    }

    private static string NormalizeUserName(string? userName)
    {
        var normalized = (userName ?? string.Empty).Trim().TrimStart('@').ToLowerInvariant();
        return normalized.Length <= 30 ? normalized : normalized[..30];
    }
}
