using System.Collections.Concurrent;
using System.Security.Claims;
using FishingApp.Domain.Enums;
using FishingApp.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FishingApp.Api.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private static readonly ConcurrentDictionary<Guid, HashSet<string>> UserConnections = new();
    private static readonly ConcurrentDictionary<Guid, DateTime> UserLastSeenUtc = new();
    private static readonly object SyncRoot = new();

    private readonly AppDbContext _context;

    public ChatHub(AppDbContext context)
    {
        _context = context;
    }

    public static bool IsUserOnline(Guid userId)
    {
        if (!UserConnections.TryGetValue(userId, out var connections))
            return false;

        lock (SyncRoot)
        {
            return connections.Count > 0;
        }
    }

    public static DateTime? GetUserLastSeenUtc(Guid userId)
    {
        return UserLastSeenUtc.TryGetValue(userId, out var lastSeenUtc)
            ? lastSeenUtc
            : null;
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrWhiteSpace(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return null;

        return userId;
    }

    private async Task<string> GetCurrentUserDisplayNameAsync(Guid userId)
    {
        var user = await _context.Users
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => new
            {
                x.FirstName,
                x.LastName,
                x.UserName
            })
            .FirstOrDefaultAsync();

        if (user == null)
            return Context.User?.Identity?.Name ?? "Пользователь";

        var fullName = $"{user.FirstName} {user.LastName}".Trim();

        return string.IsNullOrWhiteSpace(fullName)
            ? user.UserName ?? "Пользователь"
            : fullName;
    }

    private async Task SendTypingChangedAsync(Guid chatId, Guid userId, bool isTyping)
    {
        await Clients.OthersInGroup(GetChatGroupName(chatId)).SendAsync("ChatTypingChanged", new
        {
            chatId,
            userId,
            userName = await GetCurrentUserDisplayNameAsync(userId),
            isTyping,
            updatedAtUtc = DateTime.UtcNow
        });
    }

    private async Task SendVoiceRecordingChangedAsync(Guid chatId, Guid userId, bool isRecording)
    {
        await Clients.OthersInGroup(GetChatGroupName(chatId)).SendAsync("ChatVoiceRecordingChanged", new
        {
            chatId,
            userId,
            userName = await GetCurrentUserDisplayNameAsync(userId),
            isRecording,
            updatedAtUtc = DateTime.UtcNow
        });
    }

    public override async Task OnConnectedAsync()
    {
        var userId = GetCurrentUserId();

        if (userId.HasValue)
        {
            var isBlocked = await _context.Users
                .AsNoTracking()
                .AnyAsync(x => x.Id == userId.Value && x.IsBlocked);

            if (isBlocked)
            {
                Context.Abort();
                return;
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, GetUserGroupName(userId.Value));

            var connections = UserConnections.GetOrAdd(userId.Value, _ => new HashSet<string>());
            var becameOnline = false;

            lock (SyncRoot)
            {
                connections.Add(Context.ConnectionId);
                becameOnline = connections.Count == 1;
            }

            if (becameOnline)
            {
                await Clients.All.SendAsync("UserPresenceChanged", new
                {
                    userId = userId.Value,
                    isOnline = true,
                    lastSeenAtUtc = (DateTime?)null
                });
            }
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetCurrentUserId();

        if (userId.HasValue)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, GetUserGroupName(userId.Value));
        }

        if (userId.HasValue && UserConnections.TryGetValue(userId.Value, out var connections))
        {
            var becameOffline = false;
            DateTime? lastSeenAtUtc = null;

            lock (SyncRoot)
            {
                connections.Remove(Context.ConnectionId);

                if (connections.Count == 0)
                {
                    UserConnections.TryRemove(userId.Value, out _);
                    lastSeenAtUtc = DateTime.UtcNow;
                    UserLastSeenUtc[userId.Value] = lastSeenAtUtc.Value;
                    becameOffline = true;
                }
            }

            if (becameOffline)
            {
                await Clients.All.SendAsync("UserPresenceChanged", new
                {
                    userId = userId.Value,
                    isOnline = false,
                    lastSeenAtUtc
                });
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task PingPresence()
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            throw new HubException("Пользователь не авторизован.");

        await Groups.AddToGroupAsync(Context.ConnectionId, GetUserGroupName(userId.Value));
    }

    public async Task JoinChat(string chatId)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            throw new HubException("Пользователь не авторизован.");

        if (!Guid.TryParse(chatId, out var parsedChatId))
            throw new HubException("Некорректный идентификатор чата.");

        var hasAccess = await HasAccessToChatAsync(parsedChatId, userId.Value);
        if (!hasAccess)
            throw new HubException("Нет доступа к этому чату.");

        await Groups.AddToGroupAsync(Context.ConnectionId, GetChatGroupName(parsedChatId));
    }

    public async Task LeaveChat(string chatId)
    {
        if (!Guid.TryParse(chatId, out var parsedChatId))
            return;

        var userId = GetCurrentUserId();

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GetChatGroupName(parsedChatId));

        if (userId.HasValue)
        {
            await SendTypingChangedAsync(parsedChatId, userId.Value, false);
            await SendVoiceRecordingChangedAsync(parsedChatId, userId.Value, false);
        }
    }

    public async Task SetTyping(string chatId, bool isTyping)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            throw new HubException("Пользователь не авторизован.");

        if (!Guid.TryParse(chatId, out var parsedChatId))
            throw new HubException("Некорректный идентификатор чата.");

        var hasAccess = await HasAccessToChatAsync(parsedChatId, userId.Value);
        if (!hasAccess)
            throw new HubException("Нет доступа к этому чату.");

        await SendTypingChangedAsync(parsedChatId, userId.Value, isTyping);
    }

    public async Task SetVoiceRecording(string chatId, bool isRecording)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            throw new HubException("Пользователь не авторизован.");

        if (!Guid.TryParse(chatId, out var parsedChatId))
            throw new HubException("Некорректный идентификатор чата.");

        var hasAccess = await HasAccessToChatAsync(parsedChatId, userId.Value);
        if (!hasAccess)
            throw new HubException("Нет доступа к этому чату.");

        await SendVoiceRecordingChangedAsync(parsedChatId, userId.Value, isRecording);
    }

    private async Task<bool> HasAccessToChatAsync(Guid chatId, Guid userId)
    {
        var userIsBlocked = await _context.Users
            .AsNoTracking()
            .AnyAsync(x => x.Id == userId && x.IsBlocked);

        if (userIsBlocked)
            return false;

        var chat = await _context.Chats
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == chatId);

        if (chat == null)
            return false;

        if (chat.Type == ChatType.Global)
            return false;

        if (chat.Type == ChatType.Private)
            return chat.FirstUserId == userId || chat.SecondUserId == userId;

        if (chat.Type == ChatType.Group)
        {
            if (chat.IsDeletedByOwner)
                return false;

            return await _context.ChatParticipants
                .AsNoTracking()
                .AnyAsync(x =>
                    x.ChatId == chatId &&
                    x.UserId == userId &&
                    x.Status == ChatParticipantStatus.Active);
        }

        if (chat.Type == ChatType.Regional)
        {
            if (string.IsNullOrWhiteSpace(chat.Region))
                return false;

            var userRegion = await _context.Users
                .AsNoTracking()
                .Where(x => x.Id == userId)
                .Select(x => x.Region)
                .FirstOrDefaultAsync();

            return !string.IsNullOrWhiteSpace(userRegion) &&
                   string.Equals(chat.Region, userRegion, StringComparison.OrdinalIgnoreCase);
        }

        return false;
    }

    public static string GetUserGroupName(Guid userId)
    {
        return $"user_{userId}";
    }

    private static string GetChatGroupName(Guid chatId)
    {
        return $"chat_{chatId}";
    }
}
