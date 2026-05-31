using System.ComponentModel.DataAnnotations;

namespace FishingApp.Api.DTOs.Profile;

public class UpdateProfileRequest
{
    [Required]
    [StringLength(50, MinimumLength = 2, ErrorMessage = "Имя должно содержать от 2 до 50 символов.")]
    public string FirstName { get; set; } = null!;

    [StringLength(50, ErrorMessage = "Фамилия не должна быть длиннее 50 символов.")]
    public string? LastName { get; set; }

    [Required]
    [StringLength(30, MinimumLength = 3, ErrorMessage = "Имя пользователя должно содержать от 3 до 30 символов.")]
    [RegularExpression(@"^[a-zA-Z0-9._]+$", ErrorMessage = "Имя пользователя может содержать только латинские буквы, цифры, точку и нижнее подчёркивание.")]
    public string UserName { get; set; } = string.Empty;

    [StringLength(100)]
    public string? Region { get; set; }

    [StringLength(1000)]
    public string? About { get; set; }

    [StringLength(500)]
    public string? AvatarUrl { get; set; }
}
