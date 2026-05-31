using System.ComponentModel.DataAnnotations;

namespace FishingApp.Api.DTOs.Auth;

public class ResendEmailCodeRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = null!;
}