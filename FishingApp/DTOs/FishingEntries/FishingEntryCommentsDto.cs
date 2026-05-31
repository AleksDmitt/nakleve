using System.ComponentModel.DataAnnotations;

namespace FishingApp.Api.DTOs.FishingEntries;

public class CreateFishingEntryCommentRequest
{
    [Required]
    [MaxLength(1000)]
    public string Text { get; set; } = string.Empty;

    public Guid? ParentCommentId { get; set; }
}

public class UpdateFishingEntryCommentRequest
{
    [Required]
    [MaxLength(1000)]
    public string Text { get; set; } = string.Empty;
}

public class FishingEntryCommentResponse
{
    public Guid Id { get; set; }
    public Guid FishingEntryId { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }

    public Guid? ParentCommentId { get; set; }
    public string? ParentUserName { get; set; }

    public string Text { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public bool CanEdit { get; set; }
}
