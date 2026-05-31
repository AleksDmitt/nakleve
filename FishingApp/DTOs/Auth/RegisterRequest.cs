using System.ComponentModel.DataAnnotations;

namespace FishingApp.Api.DTOs.Auth;

public class RegisterRequest
{
    [Required]
    [StringLength(50, MinimumLength = 2, ErrorMessage = "Имя должно содержать от 2 до 50 символов.")]
    public string FirstName { get; set; } = null!;

    [StringLength(50, ErrorMessage = "Фамилия не должна быть длиннее 50 символов.")]
    public string? LastName { get; set; }

    [Required]
    [StringLength(30, MinimumLength = 3, ErrorMessage = "Имя пользователя должно содержать от 3 до 30 символов.")]
    [RegularExpression(@"^[a-zA-Z0-9._]+$", ErrorMessage = "Имя пользователя может содержать только латинские буквы, цифры, точку и нижнее подчёркивание.")]
    public string UserName { get; set; } = null!;

    [Required]
    [EmailAddress]
    [StringLength(256)]
    public string Email { get; set; } = null!;

    [Required]
    [StringLength(100, MinimumLength = 8)]
    public string Password { get; set; } = null!;

    [StringLength(100)]
    public string? Region { get; set; }

    [Required]
    public bool UserAgreementAccepted { get; set; }

    [StringLength(40)]
    public string? UserAgreementVersion { get; set; }

    [Required]
    public bool PersonalDataConsentAccepted { get; set; }

    [StringLength(40)]
    public string? PersonalDataConsentVersion { get; set; }

    [Required]
    public bool PersonalDataDistributionConsentAccepted { get; set; }

    [StringLength(40)]
    public string? PersonalDataDistributionConsentVersion { get; set; }
}
