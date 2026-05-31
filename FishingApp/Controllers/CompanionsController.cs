using System.Security.Claims;
using FishingApp.Api.DTOs.Companions;
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
[Route("api/companions/requests")]
[Authorize]
public class CompanionsController : ControllerBase
{
    private const int MaxTitleLength = 120;
    private const int MaxDescriptionLength = 1500;
    private const int MaxRegionLength = 120;
    private const int MaxMeetingPointLength = 300;
    private const int MaxResponseMessageLength = 1000;

    private readonly AppDbContext _context;
    private readonly IHubContext<ChatHub> _chatHub;

    public CompanionsController(AppDbContext context, IHubContext<ChatHub> chatHub)
    {
        _context = context;
        _chatHub = chatHub;
    }

    [HttpGet]
    public async Task<IActionResult> GetRequests()
    {
        await CloseExpiredOpenRequestsAsync();

        var currentUserId = GetCurrentUserIdOrNull();

        var requests = await _context.CompanionRequests
            .Include(x => x.User)
            .Include(x => x.Responses)
                .ThenInclude(r => r.User)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();

        return Ok(requests.Select(x => MapToListResponse(x, currentUserId)).ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        await CloseExpiredOpenRequestsAsync();

        var currentUserId = GetCurrentUserIdOrNull();

        var request = await _context.CompanionRequests
            .Include(x => x.User)
            .Include(x => x.Responses)
                .ThenInclude(r => r.User)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (request == null)
            return NotFound(new { message = "Поиск напарника не найден." });

        return Ok(MapToDetailsResponse(request, currentUserId));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateCompanionRequest request)
    {
        await CloseExpiredOpenRequestsAsync();

        var userId = GetCurrentUserId();
        var title = NormalizeRequiredText(request.Title, MaxTitleLength);
        var validationError = ValidateRequestPayload(title, request.PlannedDate, request.SeatsCount);

        if (validationError != null)
            return BadRequest(new { message = validationError });

        var companionRequest = new CompanionRequest
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = title,
            Description = NormalizeOptionalText(request.Description, MaxDescriptionLength),
            Region = NormalizeOptionalText(request.Region, MaxRegionLength),
            PlannedDate = EnsureUtc(request.PlannedDate),
            MeetingPoint = NormalizeOptionalText(request.MeetingPoint, MaxMeetingPointLength),
            SeatsCount = Math.Clamp(request.SeatsCount, 1, 20),
            Status = CompanionRequestStatus.Open,
            CreatedAt = DateTime.UtcNow
        };

        _context.CompanionRequests.Add(companionRequest);
        await _context.SaveChangesAsync();

        var created = await _context.CompanionRequests
            .Include(x => x.User)
            .Include(x => x.Responses)
                .ThenInclude(r => r.User)
            .FirstAsync(x => x.Id == companionRequest.Id);

        return Ok(MapToListResponse(created, userId));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateCompanionRequest request)
    {
        await CloseExpiredOpenRequestsAsync();

        var userId = GetCurrentUserId();
        var title = NormalizeRequiredText(request.Title, MaxTitleLength);
        var validationError = ValidateRequestPayload(title, request.PlannedDate, request.SeatsCount);

        if (validationError != null)
            return BadRequest(new { message = validationError });

        var companionRequest = await _context.CompanionRequests
            .Include(x => x.Responses)
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);

        if (companionRequest == null)
            return NotFound(new { message = "Поиск напарника не найден." });

        if (companionRequest.Status != CompanionRequestStatus.Open)
            return BadRequest(new { message = "Редактировать можно только активный поиск." });

        var acceptedCount = companionRequest.Responses.Count(x => x.Status == CompanionResponseStatus.Accepted);
        var nextSeatsCount = Math.Clamp(request.SeatsCount, 1, 20);

        if (nextSeatsCount < acceptedCount)
            return BadRequest(new { message = "Нельзя поставить мест меньше, чем уже подтверждено напарников." });

        companionRequest.Title = title;
        companionRequest.Description = NormalizeOptionalText(request.Description, MaxDescriptionLength);
        companionRequest.Region = NormalizeOptionalText(request.Region, MaxRegionLength);
        companionRequest.PlannedDate = EnsureUtc(request.PlannedDate);
        companionRequest.MeetingPoint = NormalizeOptionalText(request.MeetingPoint, MaxMeetingPointLength);
        companionRequest.SeatsCount = nextSeatsCount;

        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(userId, "companion-request-updated");

        var updated = await _context.CompanionRequests
            .Include(x => x.User)
            .Include(x => x.Responses)
                .ThenInclude(r => r.User)
            .FirstAsync(x => x.Id == id);

        return Ok(MapToDetailsResponse(updated, userId));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await CloseExpiredOpenRequestsAsync();

        var userId = GetCurrentUserId();

        var companionRequest = await _context.CompanionRequests
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);

        if (companionRequest == null)
            return NotFound(new { message = "Поиск напарника не найден." });

        _context.CompanionRequests.Remove(companionRequest);
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(userId, "companion-request-deleted");

        return Ok(new { message = "Поиск напарника удалён." });
    }

    [HttpPost("{id:guid}/responses")]
    public async Task<IActionResult> CreateResponse(Guid id, CreateCompanionResponseRequest request)
    {
        await CloseExpiredOpenRequestsAsync();

        var userId = GetCurrentUserId();

        var companionRequest = await _context.CompanionRequests
            .Include(x => x.Responses)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (companionRequest == null)
            return NotFound(new { message = "Поиск напарника не найден." });

        if (companionRequest.Status != CompanionRequestStatus.Open)
            return BadRequest(new { message = "Нельзя откликнуться на закрытый поиск." });

        if (companionRequest.UserId == userId)
            return BadRequest(new { message = "Нельзя откликнуться на свой поиск." });

        var activeResponse = companionRequest.Responses.FirstOrDefault(x =>
            x.UserId == userId &&
            (x.Status == CompanionResponseStatus.Pending || x.Status == CompanionResponseStatus.Accepted));

        if (activeResponse != null)
            return BadRequest(new { message = "Вы уже откликнулись на этот поиск." });

        var rejectedResponse = companionRequest.Responses.FirstOrDefault(x =>
            x.UserId == userId && x.Status == CompanionResponseStatus.Rejected);

        if (rejectedResponse != null)
            return BadRequest(new { message = "Автор уже отклонил ваш отклик на этот поиск." });

        var acceptedCount = companionRequest.Responses.Count(x => x.Status == CompanionResponseStatus.Accepted);

        if (acceptedCount >= companionRequest.SeatsCount)
            return BadRequest(new { message = "Все места уже заняты." });

        var cancelledResponse = companionRequest.Responses
            .Where(x => x.UserId == userId && x.Status == CompanionResponseStatus.Cancelled)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefault();

        if (cancelledResponse != null)
        {
            cancelledResponse.Message = NormalizeOptionalText(request.Message, MaxResponseMessageLength);
            cancelledResponse.Status = CompanionResponseStatus.Pending;
            cancelledResponse.CreatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await NotifyNavigationChangedAsync(companionRequest.UserId, userId, "companion-response-created");

            var restored = await _context.CompanionResponses
                .Include(x => x.User)
                .FirstAsync(x => x.Id == cancelledResponse.Id);

            return Ok(MapResponse(restored));
        }

        var response = new CompanionResponse
        {
            Id = Guid.NewGuid(),
            RequestId = companionRequest.Id,
            UserId = userId,
            Message = NormalizeOptionalText(request.Message, MaxResponseMessageLength),
            Status = CompanionResponseStatus.Pending,
            CreatedAt = DateTime.UtcNow
        };

        _context.CompanionResponses.Add(response);
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(companionRequest.UserId, userId, "companion-response-created");

        var created = await _context.CompanionResponses
            .Include(x => x.User)
            .FirstAsync(x => x.Id == response.Id);

        return Ok(MapResponse(created));
    }

    [HttpPut("{id:guid}/responses/{responseId:guid}/accept")]
    public async Task<IActionResult> AcceptResponse(Guid id, Guid responseId)
    {
        var userId = GetCurrentUserId();
        var result = await LoadOwnedResponse(id, responseId, userId);

        if (result.Error != null)
            return result.Error;

        var companionRequest = result.Request!;
        var response = result.Response!;

        if (companionRequest.Status != CompanionRequestStatus.Open)
            return BadRequest(new { message = "Подтверждать отклики можно только у активного поиска." });

        if (response.Status != CompanionResponseStatus.Pending)
            return BadRequest(new { message = "Подтвердить можно только ожидающий отклик." });

        var acceptedCount = companionRequest.Responses.Count(x => x.Status == CompanionResponseStatus.Accepted && x.Id != response.Id);

        if (acceptedCount >= companionRequest.SeatsCount)
            return BadRequest(new { message = "Свободных мест больше нет." });

        response.Status = CompanionResponseStatus.Accepted;
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(companionRequest.UserId, response.UserId, "companion-response-accepted");

        return Ok(MapResponse(response));
    }

    [HttpPut("{id:guid}/responses/{responseId:guid}/reject")]
    public async Task<IActionResult> RejectResponse(Guid id, Guid responseId)
    {
        var userId = GetCurrentUserId();
        var result = await LoadOwnedResponse(id, responseId, userId);

        if (result.Error != null)
            return result.Error;

        var response = result.Response!;

        if (response.Status != CompanionResponseStatus.Pending)
            return BadRequest(new { message = "Отклонить можно только ожидающий отклик." });

        response.Status = CompanionResponseStatus.Rejected;
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(result.Request!.UserId, response.UserId, "companion-response-rejected");

        return Ok(MapResponse(response));
    }

    [HttpPut("{id:guid}/responses/{responseId:guid}/cancel-acceptance")]
    public async Task<IActionResult> CancelResponseAcceptance(Guid id, Guid responseId)
    {
        var userId = GetCurrentUserId();
        var result = await LoadOwnedResponse(id, responseId, userId);

        if (result.Error != null)
            return result.Error;

        var response = result.Response!;

        if (response.Status != CompanionResponseStatus.Accepted)
            return BadRequest(new { message = "Отменить подтверждение можно только у подтверждённого отклика." });

        response.Status = CompanionResponseStatus.Pending;
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(result.Request!.UserId, response.UserId, "companion-response-acceptance-cancelled");

        return Ok(MapResponse(response));
    }

    [HttpPut("{id:guid}/responses/my/cancel")]
    public async Task<IActionResult> CancelMyResponse(Guid id)
    {
        var userId = GetCurrentUserId();

        var companionRequest = await _context.CompanionRequests
            .Include(x => x.Responses)
                .ThenInclude(r => r.User)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (companionRequest == null)
            return NotFound(new { message = "Поиск напарника не найден." });

        if (companionRequest.UserId == userId)
            return BadRequest(new { message = "Нельзя отменить отклик на свой поиск." });

        var response = companionRequest.Responses
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefault();

        if (response == null)
            return NotFound(new { message = "Ваш отклик не найден." });

        if (response.Status == CompanionResponseStatus.Rejected)
            return BadRequest(new { message = "Отклонённый отклик нельзя отменить." });

        if (response.Status == CompanionResponseStatus.Cancelled)
            return BadRequest(new { message = "Отклик уже отменён." });

        response.Status = CompanionResponseStatus.Cancelled;
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(companionRequest.UserId, userId, "companion-response-cancelled");

        return Ok(MapResponse(response));
    }

    [HttpPut("{id:guid}/close")]
    public async Task<IActionResult> Close(Guid id)
    {
        await CloseExpiredOpenRequestsAsync();

        var userId = GetCurrentUserId();

        var companionRequest = await _context.CompanionRequests
            .FirstOrDefaultAsync(x => x.Id == id && x.UserId == userId);

        if (companionRequest == null)
            return NotFound(new { message = "Поиск напарника не найден." });

        companionRequest.Status = CompanionRequestStatus.Closed;
        await _context.SaveChangesAsync();
        await NotifyNavigationChangedAsync(userId, "companion-request-closed");

        return Ok(new { message = "Поиск напарника закрыт." });
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

    private async Task CloseExpiredOpenRequestsAsync()
    {
        var nowUtc = DateTime.UtcNow;

        var expiredRequests = await _context.CompanionRequests
            .Where(x => x.Status == CompanionRequestStatus.Open && x.PlannedDate <= nowUtc)
            .ToListAsync();

        if (expiredRequests.Count == 0)
            return;

        foreach (var request in expiredRequests)
        {
            request.Status = CompanionRequestStatus.Closed;
        }

        await _context.SaveChangesAsync();
    }

    private async Task<(CompanionRequest? Request, CompanionResponse? Response, IActionResult? Error)> LoadOwnedResponse(Guid requestId, Guid responseId, Guid ownerId)
    {
        var companionRequest = await _context.CompanionRequests
            .Include(x => x.Responses)
                .ThenInclude(r => r.User)
            .FirstOrDefaultAsync(x => x.Id == requestId && x.UserId == ownerId);

        if (companionRequest == null)
            return (null, null, NotFound(new { message = "Поиск напарника не найден." }));

        var response = companionRequest.Responses.FirstOrDefault(x => x.Id == responseId);

        if (response == null)
            return (companionRequest, null, NotFound(new { message = "Отклик не найден." }));

        return (companionRequest, response, null);
    }

    private static CompanionRequestResponse MapToListResponse(CompanionRequest request, Guid? currentUserId)
    {
        var currentUserResponse = currentUserId == null
            ? null
            : request.Responses
                .Where(x => x.UserId == currentUserId.Value && x.Status != CompanionResponseStatus.Cancelled)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefault();

        return new CompanionRequestResponse
        {
            Id = request.Id,
            Title = request.Title,
            Description = request.Description,
            Region = request.Region,
            PlannedDate = request.PlannedDate,
            MeetingPoint = request.MeetingPoint,
            SeatsCount = request.SeatsCount,
            Status = request.Status.ToString(),
            CreatedAt = request.CreatedAt,
            UserId = request.UserId,
            UserName = request.User.UserName ?? string.Empty,
            ResponsesCount = request.Responses.Count,
            PendingResponsesCount = request.Responses.Count(x => x.Status == CompanionResponseStatus.Pending),
            AcceptedCount = request.Responses.Count(x => x.Status == CompanionResponseStatus.Accepted),
            IsCurrentUserResponded = currentUserResponse != null,
            CurrentUserResponseId = currentUserResponse?.Id,
            CurrentUserResponseStatus = currentUserResponse?.Status.ToString(),
            AcceptedResponses = request.Responses
                .Where(x => x.Status == CompanionResponseStatus.Accepted)
                .OrderBy(x => x.CreatedAt)
                .Select(x => MapResponse(x, CanSeeResponseMessage(request, x, currentUserId)))
                .ToList()
        };
    }

    private static CompanionRequestDetailsResponse MapToDetailsResponse(CompanionRequest request, Guid? currentUserId)
    {
        var currentUserResponse = currentUserId == null
            ? null
            : request.Responses
                .Where(x => x.UserId == currentUserId.Value && x.Status != CompanionResponseStatus.Cancelled)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefault();

        return new CompanionRequestDetailsResponse
        {
            Id = request.Id,
            Title = request.Title,
            Description = request.Description,
            Region = request.Region,
            PlannedDate = request.PlannedDate,
            MeetingPoint = request.MeetingPoint,
            SeatsCount = request.SeatsCount,
            Status = request.Status.ToString(),
            CreatedAt = request.CreatedAt,
            UserId = request.UserId,
            UserName = request.User.UserName ?? string.Empty,
            ResponsesCount = request.Responses.Count,
            PendingResponsesCount = request.Responses.Count(x => x.Status == CompanionResponseStatus.Pending),
            AcceptedCount = request.Responses.Count(x => x.Status == CompanionResponseStatus.Accepted),
            IsCurrentUserResponded = currentUserResponse != null,
            CurrentUserResponseId = currentUserResponse?.Id,
            CurrentUserResponseStatus = currentUserResponse?.Status.ToString(),
            Responses = GetVisibleResponses(request, currentUserId)
                .OrderByDescending(x => x.CreatedAt)
                .Select(x => MapResponse(x, CanSeeResponseMessage(request, x, currentUserId)))
                .ToList()
        };
    }

    private static IEnumerable<CompanionResponse> GetVisibleResponses(CompanionRequest request, Guid? currentUserId)
    {
        if (currentUserId == request.UserId)
            return request.Responses;

        if (currentUserId == null)
        {
            return request.Responses
                .Where(x => x.Status == CompanionResponseStatus.Accepted);
        }

        return request.Responses
            .Where(x =>
                x.Status == CompanionResponseStatus.Accepted ||
                x.UserId == currentUserId.Value);
    }

    private static bool CanSeeResponseMessage(CompanionRequest request, CompanionResponse response, Guid? currentUserId)
    {
        return currentUserId != null &&
               (currentUserId.Value == request.UserId || currentUserId.Value == response.UserId);
    }

    private static CompanionResponseDto MapResponse(CompanionResponse response, bool includeMessage = true)
    {
        return new CompanionResponseDto
        {
            Id = response.Id,
            RequestId = response.RequestId,
            UserId = response.UserId,
            UserName = response.User.UserName ?? string.Empty,
            Message = includeMessage ? response.Message : null,
            Status = response.Status.ToString(),
            CreatedAt = response.CreatedAt
        };
    }

    private Guid GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            throw new UnauthorizedAccessException("Пользователь не авторизован.");

        return userId;
    }

    private Guid? GetCurrentUserIdOrNull()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out var userId) ? userId : null;
    }

    private static string? ValidateRequestPayload(string? title, DateTime plannedDate, int seatsCount)
    {
        if (string.IsNullOrWhiteSpace(title))
            return "Укажите заголовок поиска.";

        if (plannedDate == default)
            return "Укажите дату и время рыбалки.";

        var plannedDateUtc = EnsureUtc(plannedDate);

        if (plannedDateUtc <= DateTime.UtcNow)
            return "Нельзя выбрать прошедшую дату и время.";

        if (seatsCount < 1)
            return "Количество мест должно быть не меньше 1.";

        if (seatsCount > 20)
            return "Слишком большое количество мест.";

        return null;
    }

    private static string NormalizeRequiredText(string? value, int maxLength)
    {
        var text = value?.Trim() ?? string.Empty;
        return text.Length <= maxLength ? text : text[..maxLength];
    }

    private static string? NormalizeOptionalText(string? value, int maxLength)
    {
        var text = value?.Trim();

        if (string.IsNullOrWhiteSpace(text))
            return null;

        return text.Length <= maxLength ? text : text[..maxLength];
    }

    private static DateTime EnsureUtc(DateTime value)
    {
        if (value.Kind == DateTimeKind.Utc)
            return value;

        if (value.Kind == DateTimeKind.Local)
            return value.ToUniversalTime();

        return DateTime.SpecifyKind(value, DateTimeKind.Local).ToUniversalTime();
    }
}
