using System.ComponentModel.DataAnnotations;

namespace FishingApp.Api.DTOs.Auth;

public class ChangePasswordWithCodeRequest
{
    [Required]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "Код должен состоять из 6 цифр.")]
    public string Code { get; set; } = null!;

    [Required]
    [StringLength(100, MinimumLength = 8)]
    public string NewPassword { get; set; } = null!;
}