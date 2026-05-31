using System.ComponentModel.DataAnnotations;

namespace FishingApp.Api.DTOs.Profile;

public class UpdateAvatarRequest
{
    [StringLength(500)]
    public string? AvatarUrl { get; set; }
}
