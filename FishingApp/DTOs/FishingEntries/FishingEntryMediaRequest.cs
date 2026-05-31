using System.ComponentModel.DataAnnotations;

namespace FishingApp.Api.DTOs.FishingEntries;

public class FishingEntryMediaRequest
{
    [Required]
    [MaxLength(500)]
    public string Url { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string MediaType { get; set; } = "image";

    public int SortOrder { get; set; }
}
