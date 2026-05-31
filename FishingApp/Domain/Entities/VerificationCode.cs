using FishingApp.Domain.Enums;

namespace FishingApp.Domain.Entities;

public class VerificationCode
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;

    public VerificationCodePurpose Purpose { get; set; }

    public string CodeHash { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }

    public DateTime? UsedAt { get; set; }

    public int FailedAttempts { get; set; }
    public int MaxAttempts { get; set; } = 5;

    public string? SentTo { get; set; }
    public string? IpAddress { get; set; }
}