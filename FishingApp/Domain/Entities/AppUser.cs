using Microsoft.AspNetCore.Identity;

namespace FishingApp.Domain.Entities;

public class AppUser : IdentityUser<Guid>
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }

    public string? AvatarUrl { get; set; }
    public string? Region { get; set; }
    public string? About { get; set; }
    public bool IsBlocked { get; set; } = false;
    public string? BlockReasonCode { get; set; }
    public string? BlockReasonText { get; set; }
    public DateTime? BlockedAtUtc { get; set; }
    public Guid? BlockedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSeenAtUtc { get; set; }

    public bool ChatToastsEnabled { get; set; } = true;
    public bool HideChatMessageTextInNotifications { get; set; } = false;

    public bool UserAgreementAccepted { get; set; } = false;
    public DateTime? UserAgreementAcceptedAtUtc { get; set; }
    public string? UserAgreementVersion { get; set; }
    public string? UserAgreementIp { get; set; }
    public string? UserAgreementUserAgent { get; set; }

    public bool PersonalDataConsentAccepted { get; set; } = false;
    public DateTime? PersonalDataConsentAcceptedAtUtc { get; set; }
    public string? PersonalDataConsentVersion { get; set; }
    public string? PersonalDataConsentIp { get; set; }
    public string? PersonalDataConsentUserAgent { get; set; }

    public bool PersonalDataDistributionConsentAccepted { get; set; } = false;
    public DateTime? PersonalDataDistributionConsentAcceptedAtUtc { get; set; }
    public string? PersonalDataDistributionConsentVersion { get; set; }
    public string? PersonalDataDistributionConsentIp { get; set; }
    public string? PersonalDataDistributionConsentUserAgent { get; set; }

    public ICollection<FishingEntry> FishingEntries { get; set; } = new List<FishingEntry>();
    public ICollection<PointOfInterest> CreatedPoints { get; set; } = new List<PointOfInterest>();
    public ICollection<CompanionRequest> CompanionRequests { get; set; } = new List<CompanionRequest>();
    public ICollection<CompanionResponse> CompanionResponses { get; set; } = new List<CompanionResponse>();
    public ICollection<ChatMessage> ChatMessages { get; set; } = new List<ChatMessage>();
    public ICollection<ModerationLog> ModerationLogs { get; set; } = new List<ModerationLog>();

    public ICollection<Friendship> SentFriendRequests { get; set; } = new List<Friendship>();
    public ICollection<Friendship> ReceivedFriendRequests { get; set; } = new List<Friendship>();
    public ICollection<ChatParticipant> ChatParticipants { get; set; } = new List<ChatParticipant>();
    public ICollection<ChatReadState> ChatReadStates { get; set; } = new List<ChatReadState>();

    public ICollection<UserBlock> CreatedUserBlocks { get; set; } = new List<UserBlock>();
    public ICollection<UserBlock> ReceivedUserBlocks { get; set; } = new List<UserBlock>();
    public ICollection<UserReport> SentUserReports { get; set; } = new List<UserReport>();
    public ICollection<UserReport> ReceivedUserReports { get; set; } = new List<UserReport>();
}
