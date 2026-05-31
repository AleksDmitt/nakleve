using System.Security.Claims;
using FishingApp.Api.DTOs;
using FishingApp.Domain.Entities;
using FishingApp.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FishingApp.Api.Controllers.MapPoints;

[ApiController]
[Route("api/map-points")]
[Authorize]
public class MapPointsController : ControllerBase
{
    private readonly AppDbContext _context;

    public MapPointsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetPoints()
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var points = await _context.PointsOfInterest
            .Where(x => x.CreatedByUserId == userId.Value)
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => ToResponse(x))
            .ToListAsync();

        return Ok(points);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var point = await _context.PointsOfInterest
            .Where(x => x.Id == id && x.CreatedByUserId == userId.Value)
            .Select(x => ToResponse(x))
            .FirstOrDefaultAsync();

        if (point == null)
            return NotFound(new { message = "Точка не найдена." });

        return Ok(point);
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreatePointOfInterestRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Укажите название точки." });

        if (!IsValidCoordinates(request.Latitude, request.Longitude))
            return BadRequest(new { message = "Некорректные координаты." });

        var point = new PointOfInterest
        {
            Id = Guid.NewGuid(),
            CreatedByUserId = userId.Value,
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            Type = request.Type,
            Region = string.IsNullOrWhiteSpace(request.Region) ? null : request.Region.Trim(),
            IsApproved = true,
            IsVisibleOnMap = request.IsVisibleOnMap,
            CreatedAt = DateTime.UtcNow
        };

        _context.PointsOfInterest.Add(point);
        await _context.SaveChangesAsync();

        return Ok(ToResponse(point));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdatePointOfInterestRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Укажите название точки." });

        if (!IsValidCoordinates(request.Latitude, request.Longitude))
            return BadRequest(new { message = "Некорректные координаты." });

        var point = await _context.PointsOfInterest
            .FirstOrDefaultAsync(x => x.Id == id && x.CreatedByUserId == userId.Value);

        if (point == null)
            return NotFound(new { message = "Точка не найдена." });

        point.Name = request.Name.Trim();
        point.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        point.Latitude = request.Latitude;
        point.Longitude = request.Longitude;
        point.Type = request.Type;
        point.Region = string.IsNullOrWhiteSpace(request.Region) ? null : request.Region.Trim();
        point.IsVisibleOnMap = request.IsVisibleOnMap;

        await _context.SaveChangesAsync();

        return Ok(ToResponse(point));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var point = await _context.PointsOfInterest
            .FirstOrDefaultAsync(x => x.Id == id && x.CreatedByUserId == userId.Value);

        if (point == null)
            return NotFound(new { message = "Точка не найдена." });

        _context.PointsOfInterest.Remove(point);
        await _context.SaveChangesAsync();

        return Ok(new { message = "Точка удалена." });
    }

    private Guid? GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return null;

        return userId;
    }

    private static bool IsValidCoordinates(double latitude, double longitude)
    {
        return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    }

    private static PointOfInterestResponse ToResponse(PointOfInterest x)
    {
        return new PointOfInterestResponse
        {
            Id = x.Id,
            CreatedByUserId = x.CreatedByUserId,
            Name = x.Name,
            Description = x.Description,
            Latitude = x.Latitude,
            Longitude = x.Longitude,
            Type = x.Type,
            Region = x.Region,
            IsApproved = x.IsApproved,
            IsVisibleOnMap = x.IsVisibleOnMap,
            CreatedAt = x.CreatedAt
        };
    }
}
