using System.Security.Cryptography;
using System.Text;
using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using FishingApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace FishingApp.Api.Services.Auth;

public class VerificationCodeService : IVerificationCodeService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly ILogger<VerificationCodeService> _logger;

    private const int CodeLifetimeMinutes = 10;
    private const int ResendCooldownSeconds = 60;
    private const int MaxCodesPerHour = 5;
    private const int MaxCodesPerIpPerHour = 20;
    private const int MaxAttemptsPerCode = 5;
    private const int CodeLength = 6;

    public VerificationCodeService(
        AppDbContext db,
        IConfiguration configuration,
        ILogger<VerificationCodeService> logger)
    {
        _db = db;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<string> CreateCodeAsync(
        AppUser user,
        VerificationCodePurpose purpose,
        string sentTo,
        string? ipAddress)
    {
        var now = DateTime.UtcNow;
        var normalizedSentTo = NormalizeSentTo(sentTo);
        var normalizedIpAddress = NormalizeIpAddress(ipAddress);

        if (string.IsNullOrWhiteSpace(normalizedSentTo))
            throw new InvalidOperationException("Не указан адрес для отправки кода.");

        var lastCode = await _db.VerificationCodes
            .Where(x => x.UserId == user.Id && x.Purpose == purpose)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync();

        if (lastCode != null && lastCode.CreatedAt > now.AddSeconds(-ResendCooldownSeconds))
        {
            throw new InvalidOperationException(
                $"Код уже был отправлен. Повторная отправка будет доступна через {ResendCooldownSeconds} секунд.");
        }

        var codesLastHour = await _db.VerificationCodes
            .CountAsync(x =>
                x.UserId == user.Id &&
                x.Purpose == purpose &&
                x.CreatedAt > now.AddHours(-1));

        if (codesLastHour >= MaxCodesPerHour)
        {
            throw new InvalidOperationException(
                "Слишком много кодов за последний час. Попробуйте позже.");
        }

        var destinationCodesLastHour = await _db.VerificationCodes
            .CountAsync(x =>
                x.Purpose == purpose &&
                x.SentTo == normalizedSentTo &&
                x.CreatedAt > now.AddHours(-1));

        if (destinationCodesLastHour >= MaxCodesPerHour)
        {
            throw new InvalidOperationException(
                "Слишком много кодов для этого адреса за последний час. Попробуйте позже.");
        }

        if (!string.IsNullOrWhiteSpace(normalizedIpAddress))
        {
            var ipCodesLastHour = await _db.VerificationCodes
                .CountAsync(x =>
                    x.IpAddress == normalizedIpAddress &&
                    x.CreatedAt > now.AddHours(-1));

            if (ipCodesLastHour >= MaxCodesPerIpPerHour)
            {
                throw new InvalidOperationException(
                    "Слишком много запросов с вашего устройства. Попробуйте позже.");
            }
        }

        var activeOldCodes = await _db.VerificationCodes
            .Where(x =>
                x.UserId == user.Id &&
                x.Purpose == purpose &&
                x.UsedAt == null &&
                x.ExpiresAt > now)
            .ToListAsync();

        foreach (var oldCode in activeOldCodes)
        {
            oldCode.UsedAt = now;
        }

        var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

        var verificationCode = new VerificationCode
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Purpose = purpose,
            CodeHash = HashCode(code, user.Id, purpose),
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(CodeLifetimeMinutes),
            MaxAttempts = MaxAttemptsPerCode,
            SentTo = normalizedSentTo,
            IpAddress = normalizedIpAddress
        };

        _db.VerificationCodes.Add(verificationCode);
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Verification code created for user {UserId}, purpose {Purpose}, sentTo {SentTo}.",
            user.Id,
            purpose,
            MaskDestination(normalizedSentTo));

        return code;
    }

    public async Task<bool> VerifyCodeAsync(
        AppUser user,
        VerificationCodePurpose purpose,
        string code)
    {
        var now = DateTime.UtcNow;
        var normalizedCode = NormalizeCode(code);

        if (string.IsNullOrWhiteSpace(normalizedCode) || normalizedCode.Length != CodeLength)
            return false;

        var verificationCode = await _db.VerificationCodes
            .Where(x =>
                x.UserId == user.Id &&
                x.Purpose == purpose &&
                x.UsedAt == null)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync();

        if (verificationCode == null)
            return false;

        if (verificationCode.ExpiresAt < now)
        {
            verificationCode.UsedAt = now;
            await _db.SaveChangesAsync();
            return false;
        }

        if (verificationCode.FailedAttempts >= verificationCode.MaxAttempts)
        {
            verificationCode.UsedAt = now;
            await _db.SaveChangesAsync();
            return false;
        }

        var incomingHash = HashCode(normalizedCode, user.Id, purpose);
        var isValid = FixedTimeEquals(verificationCode.CodeHash, incomingHash);

        if (!isValid)
        {
            verificationCode.FailedAttempts++;

            if (verificationCode.FailedAttempts >= verificationCode.MaxAttempts)
            {
                verificationCode.UsedAt = now;
            }

            await _db.SaveChangesAsync();
            return false;
        }

        verificationCode.UsedAt = now;
        await _db.SaveChangesAsync();

        return true;
    }

    private string HashCode(string code, Guid userId, VerificationCodePurpose purpose)
    {
        var secret = _configuration["VerificationCodes:Key"];

        if (string.IsNullOrWhiteSpace(secret))
        {
            secret = _configuration["JwtSettings:Key"];
        }

        if (string.IsNullOrWhiteSpace(secret))
            throw new InvalidOperationException("Verification code secret is not configured.");

        var payload = $"{userId:N}:{purpose}:{code}";

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var bytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));

        return Convert.ToHexString(bytes);
    }

    private static bool FixedTimeEquals(string a, string b)
    {
        var aBytes = Convert.FromHexString(a);
        var bBytes = Convert.FromHexString(b);

        return aBytes.Length == bBytes.Length &&
               CryptographicOperations.FixedTimeEquals(aBytes, bBytes);
    }

    private static string NormalizeCode(string? code)
    {
        if (string.IsNullOrWhiteSpace(code))
            return string.Empty;

        var digits = new string(code.Where(char.IsDigit).ToArray());
        return digits.Length <= CodeLength ? digits : digits[..CodeLength];
    }

    private static string NormalizeSentTo(string? sentTo)
    {
        return (sentTo ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static string? NormalizeIpAddress(string? ipAddress)
    {
        var normalized = ipAddress?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string MaskDestination(string value)
    {
        var normalized = NormalizeSentTo(value);
        var atIndex = normalized.IndexOf('@');

        if (atIndex <= 1)
            return "***";

        var name = normalized[..atIndex];
        var domain = normalized[(atIndex + 1)..];

        var visibleName = name.Length <= 2
            ? name[0].ToString()
            : name[..2];

        return $"{visibleName}***@{domain}";
    }
}
