using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FishingApp.Infrastructure.Data;

public class AppDbContext : IdentityDbContext<AppUser, Microsoft.AspNetCore.Identity.IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<FishingEntry> FishingEntries => Set<FishingEntry>();
    public DbSet<FishingEntryMedia> FishingEntryMedia => Set<FishingEntryMedia>();
    public DbSet<PointOfInterest> PointsOfInterest => Set<PointOfInterest>();
    public DbSet<CompanionRequest> CompanionRequests => Set<CompanionRequest>();
    public DbSet<CompanionResponse> CompanionResponses => Set<CompanionResponse>();
    public DbSet<Chat> Chats => Set<Chat>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatReadState> ChatReadStates => Set<ChatReadState>();
    public DbSet<HiddenChatMessage> HiddenChatMessages => Set<HiddenChatMessage>();
    public DbSet<ChatParticipant> ChatParticipants => Set<ChatParticipant>();
    public DbSet<PrivateChatUserState> PrivateChatUserStates => Set<PrivateChatUserState>();
    public DbSet<WeatherCache> WeatherCaches => Set<WeatherCache>();
    public DbSet<ModerationLog> ModerationLogs => Set<ModerationLog>();
    public DbSet<ChatMessageAttachment> ChatMessageAttachments => Set<ChatMessageAttachment>();
    public DbSet<FishingEntryLike> FishingEntryLikes => Set<FishingEntryLike>();
    public DbSet<FishingEntryComment> FishingEntryComments => Set<FishingEntryComment>();
    public DbSet<FishingEntryShare> FishingEntryShares => Set<FishingEntryShare>();
    public DbSet<VerificationCode> VerificationCodes => Set<VerificationCode>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        ConfigureFriendships(builder);
        ConfigureUsers(builder);
        ConfigureFishingEntries(builder);
        ConfigurePointsOfInterest(builder);
        ConfigureCompanionRequests(builder);
        ConfigureCompanionResponses(builder);
        ConfigureChats(builder);
        ConfigureChatParticipants(builder);
        ConfigureChatMessages(builder);
        ConfigureChatReadStates(builder);
        ConfigurePrivateChatUserStates(builder);
        ConfigureHiddenChatMessages(builder);
        ConfigureWeatherCache(builder);
        ConfigureModerationLogs(builder);
        ConfigureChatMessageAttachments(builder);
        ConfigureVerificationCodes(builder);
        builder.Entity<ChatParticipant>()
            .Property(x => x.Status)
            .HasDefaultValue(ChatParticipantStatus.Active);

        builder.Entity<Chat>()
            .Property(x => x.IsDeletedByOwner)
            .HasDefaultValue(false);
        builder.Entity<FishingEntryLike>()
    .HasIndex(x => new { x.FishingEntryId, x.UserId })
    .IsUnique();

        builder.Entity<FishingEntryLike>()
            .HasOne(x => x.FishingEntry)
            .WithMany()
            .HasForeignKey(x => x.FishingEntryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<FishingEntryLike>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<FishingEntryComment>()
            .Property(x => x.Text)
            .HasMaxLength(1000)
            .IsRequired();

        builder.Entity<FishingEntryComment>()
            .HasOne(x => x.FishingEntry)
            .WithMany()
            .HasForeignKey(x => x.FishingEntryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<FishingEntryComment>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<FishingEntryComment>()
            .HasOne(x => x.ParentComment)
            .WithMany(x => x.Replies)
            .HasForeignKey(x => x.ParentCommentId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<FishingEntryComment>()
            .HasIndex(x => new { x.FishingEntryId, x.ParentCommentId, x.CreatedAt });

        builder.Entity<FishingEntryShare>()
            .HasOne(x => x.FishingEntry)
            .WithMany()
            .HasForeignKey(x => x.FishingEntryId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Entity<FishingEntryShare>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureUsers(ModelBuilder builder)
    {
        builder.Entity<AppUser>(entity =>
        {
            entity.ToTable("Users");

            entity.Property(x => x.FirstName).HasMaxLength(50);
            entity.Property(x => x.LastName).HasMaxLength(50);
            entity.Property(x => x.AvatarUrl).HasMaxLength(500);
            entity.Property(x => x.Region).HasMaxLength(100);
            entity.Property(x => x.Region).HasMaxLength(100);
            entity.Property(x => x.About).HasMaxLength(1000);
            entity.Property(x => x.ChatToastsEnabled).HasDefaultValue(true);
            entity.Property(x => x.HideChatMessageTextInNotifications).HasDefaultValue(false);
        });
    }

    private static void ConfigureFishingEntries(ModelBuilder builder)
    {
        builder.Entity<FishingEntry>(entity =>
        {
            entity.ToTable("FishingEntries");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Title)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(x => x.Description)
                .HasMaxLength(2000);

            entity.Property(x => x.FishingStartedAt)
                .IsRequired();

            entity.Property(x => x.FishingEndedAt);

            entity.HasIndex(x => new { x.UserId, x.FishingStartedAt });

            entity.Property(x => x.LocationName)
                .HasMaxLength(200);

            entity.Property(x => x.CatchType)
                .HasMaxLength(100);

            entity.Property(x => x.CatchWeight)
                .HasPrecision(10, 2);

            entity.Property(x => x.Bait)
                .HasMaxLength(100);

            entity.Property(x => x.WeatherSummary)
                .HasMaxLength(300);

            entity.Property(x => x.PhotoUrl)
                .HasMaxLength(500);

            entity.HasOne(x => x.User)
                .WithMany(x => x.FishingEntries)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<FishingEntryMedia>(entity =>
        {
            entity.ToTable("FishingEntryMedia");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Url)
                .IsRequired()
                .HasMaxLength(500);

            entity.Property(x => x.MediaType)
                .IsRequired()
                .HasMaxLength(20);

            entity.HasIndex(x => new { x.FishingEntryId, x.SortOrder });

            entity.HasOne(x => x.FishingEntry)
                .WithMany(x => x.Media)
                .HasForeignKey(x => x.FishingEntryId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigurePointsOfInterest(ModelBuilder builder)
    {
        builder.Entity<PointOfInterest>(entity =>
        {
            entity.ToTable("PointsOfInterest");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Name)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(x => x.Description)
                .HasMaxLength(2000);

            entity.Property(x => x.Region)
                .HasMaxLength(100);

            entity.HasOne(x => x.CreatedByUser)
                .WithMany(x => x.CreatedPoints)
                .HasForeignKey(x => x.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureCompanionRequests(ModelBuilder builder)
    {
        builder.Entity<CompanionRequest>(entity =>
        {
            entity.ToTable("CompanionRequests");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Title)
                .IsRequired()
                .HasMaxLength(200);

            entity.Property(x => x.Description)
                .HasMaxLength(2000);

            entity.Property(x => x.Region)
                .HasMaxLength(100);

            entity.Property(x => x.MeetingPoint)
                .HasMaxLength(200);

            entity.Property(x => x.SeatsCount)
                .HasDefaultValue(1);

            entity.HasOne(x => x.User)
                .WithMany(x => x.CompanionRequests)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureCompanionResponses(ModelBuilder builder)
    {
        builder.Entity<CompanionResponse>(entity =>
        {
            entity.ToTable("CompanionResponses");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Message)
                .HasMaxLength(1000);

            entity.Property(x => x.Status)
                .HasDefaultValue(CompanionResponseStatus.Pending);

            entity.HasIndex(x => new { x.RequestId, x.UserId })
                .IsUnique();

            entity.HasOne(x => x.Request)
                .WithMany(x => x.Responses)
                .HasForeignKey(x => x.RequestId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany(x => x.CompanionResponses)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureChats(ModelBuilder builder)
    {
        builder.Entity<Chat>(entity =>
        {
            entity.ToTable("Chats");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Name)
                .IsRequired()
                .HasMaxLength(150);

            entity.Property(x => x.Description)
                .HasMaxLength(1000);

            entity.Property(x => x.AvatarUrl)
                .HasMaxLength(500);

            entity.Property(x => x.Region)
                .HasMaxLength(100);

            entity.Property(x => x.InviteCode)
                .HasMaxLength(100);

            entity.Property(x => x.Type)
                .IsRequired();

            entity.HasIndex(x => new { x.Type, x.FirstUserId, x.SecondUserId });

            entity.HasIndex(x => x.InviteCode)
                .IsUnique();

            entity.HasOne(x => x.CreatedByUser)
                .WithMany()
                .HasForeignKey(x => x.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureChatParticipants(ModelBuilder builder)
    {
        builder.Entity<ChatParticipant>(entity =>
        {
            entity.ToTable("ChatParticipants");

            entity.HasKey(x => x.Id);

            entity.HasIndex(x => new { x.ChatId, x.UserId })
                .IsUnique();

            entity.Property(x => x.IsMuted).HasDefaultValue(false);

            entity.HasOne(x => x.Chat)
                .WithMany(x => x.Participants)
                .HasForeignKey(x => x.ChatId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany(x => x.ChatParticipants)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigurePrivateChatUserStates(ModelBuilder builder)
    {
        builder.Entity<PrivateChatUserState>(entity =>
        {
            entity.ToTable("PrivateChatUserStates");

            entity.HasKey(x => x.Id);
            entity.Property(x => x.IsMuted).HasDefaultValue(false);

            entity.HasIndex(x => new { x.ChatId, x.UserId })
                .IsUnique();

            entity.HasOne(x => x.Chat)
                .WithMany(x => x.PrivateChatStates)
                .HasForeignKey(x => x.ChatId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureChatMessages(ModelBuilder builder)
    {
        builder.Entity<ChatMessage>(entity =>
        {
            entity.ToTable("ChatMessages");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Text)
                .IsRequired()
                .HasMaxLength(4000);

            entity.HasOne(x => x.Chat)
                .WithMany(x => x.Messages)
                .HasForeignKey(x => x.ChatId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany(x => x.ChatMessages)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.ReplyToMessage)
                .WithMany(x => x.Replies)
                .HasForeignKey(x => x.ReplyToMessageId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.SharedFishingEntry)
                .WithMany()
                .HasForeignKey(x => x.SharedFishingEntryId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    private static void ConfigureChatReadStates(ModelBuilder builder)
    {
        builder.Entity<ChatReadState>(entity =>
        {
            entity.ToTable("ChatReadStates");

            entity.HasKey(x => x.Id);

            entity.HasIndex(x => new { x.ChatId, x.UserId })
                .IsUnique();

            entity.HasOne(x => x.Chat)
                .WithMany()
                .HasForeignKey(x => x.ChatId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany(x => x.ChatReadStates)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureChatMessageAttachments(ModelBuilder builder)
    {
        builder.Entity<ChatMessageAttachment>(entity =>
        {
            entity.ToTable("ChatMessageAttachments");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.FileName)
                .IsRequired()
                .HasMaxLength(255);

            entity.Property(x => x.StoredFileName)
                .IsRequired()
                .HasMaxLength(255);

            entity.Property(x => x.FileUrl)
                .IsRequired()
                .HasMaxLength(1000);

            entity.Property(x => x.ContentType)
                .IsRequired()
                .HasMaxLength(255);

            entity.Property(x => x.AttachmentType)
                .IsRequired()
                .HasMaxLength(50);

            entity.Property(x => x.IsVoiceMessage)
                .HasDefaultValue(false);

            entity.Property(x => x.VoiceWaveform)
                .HasMaxLength(2000);

            entity.HasOne(x => x.ChatMessage)
                .WithMany(x => x.Attachments)
                .HasForeignKey(x => x.ChatMessageId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureHiddenChatMessages(ModelBuilder builder)
    {
        builder.Entity<HiddenChatMessage>(entity =>
        {
            entity.ToTable("HiddenChatMessages");

            entity.HasKey(x => x.Id);

            entity.HasIndex(x => new { x.MessageId, x.UserId }).IsUnique();

            entity.HasOne(x => x.Message)
                .WithMany(x => x.HiddenForUsers)
                .HasForeignKey(x => x.MessageId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureWeatherCache(ModelBuilder builder)
    {
        builder.Entity<WeatherCache>(entity =>
        {
            entity.ToTable("WeatherCaches");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Temperature).HasPrecision(8, 2);
            entity.Property(x => x.WindSpeed).HasPrecision(8, 2);
            entity.Property(x => x.Pressure).HasPrecision(8, 2);
            entity.Property(x => x.Humidity).HasPrecision(8, 2);

            entity.Property(x => x.Description)
                .HasMaxLength(300);
        });
    }

    private static void ConfigureModerationLogs(ModelBuilder builder)
    {
        builder.Entity<ModerationLog>(entity =>
        {
            entity.ToTable("ModerationLogs");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Action)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(x => x.EntityType)
                .IsRequired()
                .HasMaxLength(100);

            entity.Property(x => x.Reason)
                .HasMaxLength(1000);

            entity.HasOne(x => x.AdminUser)
                .WithMany(x => x.ModerationLogs)
                .HasForeignKey(x => x.AdminUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureFriendships(ModelBuilder builder)
    {
        builder.Entity<Friendship>(entity =>
        {
            entity.ToTable("Friendships");

            entity.HasKey(x => x.Id);

            entity.HasOne(x => x.Requester)
                .WithMany(x => x.SentFriendRequests)
                .HasForeignKey(x => x.RequesterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Addressee)
                .WithMany(x => x.ReceivedFriendRequests)
                .HasForeignKey(x => x.AddresseeId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(x => new { x.RequesterId, x.AddresseeId }).IsUnique();
        });
    }
    private static void ConfigureVerificationCodes(ModelBuilder builder)
    {
        builder.Entity<VerificationCode>(entity =>
        {
            entity.ToTable("VerificationCodes");

            entity.HasKey(x => x.Id);

            entity.Property(x => x.Purpose)
                .HasConversion<string>()
                .HasMaxLength(50)
                .IsRequired();

            entity.Property(x => x.CodeHash)
                .IsRequired()
                .HasMaxLength(128);

            entity.Property(x => x.SentTo)
                .HasMaxLength(256);

            entity.Property(x => x.IpAddress)
                .HasMaxLength(64);

            entity.HasIndex(x => new { x.UserId, x.Purpose, x.CreatedAt });

            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}