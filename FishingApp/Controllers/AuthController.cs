using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using FishingApp.Api.DTOs.Auth;
using FishingApp.Api.Services.Auth;
using FishingApp.Api.Settings;
using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FishingApp.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private const int MaxNameLength = 80;
    private const int MaxRegionLength = 120;
    private const int MaxCodeLength = 20;
    private const int MaxConsentVersionLength = 40;
    private const string CurrentUserAgreementVersion = "2026-05-30";
    private const string CurrentPersonalDataConsentVersion = "2026-05-30";
    private const string CurrentPersonalDataDistributionConsentVersion = "2026-05-30";

    private readonly UserManager<AppUser> _userManager;
    private readonly JwtSettings _jwtSettings;
    private readonly IVerificationCodeService _verificationCodeService;
    private readonly IAppEmailSender _emailSender;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        UserManager<AppUser> userManager,
        IOptions<JwtSettings> jwtOptions,
        IVerificationCodeService verificationCodeService,
        IAppEmailSender emailSender,
        ILogger<AuthController> logger)
    {
        _userManager = userManager;
        _jwtSettings = jwtOptions.Value;
        _verificationCodeService = verificationCodeService;
        _emailSender = emailSender;
        _logger = logger;
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized(new { message = "Некорректный идентификатор пользователя." });

        var user = await _userManager.FindByIdAsync(userId.ToString());

        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        return Ok(await CreateMeResponseAsync(user));
    }

    [Authorize]
    [HttpPost("accept-legal-documents")]
    public async Task<IActionResult> AcceptLegalDocuments(AcceptLegalDocumentsRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return Unauthorized(new { message = "Пользователь не авторизован." });

        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized(new { message = "Некорректный идентификатор пользователя." });

        var user = await _userManager.FindByIdAsync(userId.ToString());

        if (user == null)
            return NotFound(new { message = "Пользователь не найден." });

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        if (!request.UserAgreementAccepted)
            return BadRequest(new { message = "Для продолжения необходимо принять пользовательское соглашение." });

        if (!request.PersonalDataConsentAccepted)
            return BadRequest(new { message = "Для продолжения необходимо согласие на обработку персональных данных." });

        if (!request.PersonalDataDistributionConsentAccepted)
            return BadRequest(new { message = "Для продолжения необходимо согласие на обработку персональных данных, разрешенных для распространения." });

        var acceptedAtUtc = DateTime.UtcNow;
        var requestIp = HttpContext.Connection.RemoteIpAddress?.ToString();
        var requestUserAgent = Request.Headers.UserAgent.ToString();

        user.UserAgreementAccepted = true;
        user.UserAgreementAcceptedAtUtc = acceptedAtUtc;
        user.UserAgreementVersion = NormalizeOptionalText(request.UserAgreementVersion, MaxConsentVersionLength)
            ?? CurrentUserAgreementVersion;
        user.UserAgreementIp = requestIp;
        user.UserAgreementUserAgent = requestUserAgent;

        user.PersonalDataConsentAccepted = true;
        user.PersonalDataConsentAcceptedAtUtc = acceptedAtUtc;
        user.PersonalDataConsentVersion = NormalizeOptionalText(request.PersonalDataConsentVersion, MaxConsentVersionLength)
            ?? CurrentPersonalDataConsentVersion;
        user.PersonalDataConsentIp = requestIp;
        user.PersonalDataConsentUserAgent = requestUserAgent;

        user.PersonalDataDistributionConsentAccepted = true;
        user.PersonalDataDistributionConsentAcceptedAtUtc = acceptedAtUtc;
        user.PersonalDataDistributionConsentVersion = NormalizeOptionalText(request.PersonalDataDistributionConsentVersion, MaxConsentVersionLength)
            ?? CurrentPersonalDataDistributionConsentVersion;
        user.PersonalDataDistributionConsentIp = requestIp;
        user.PersonalDataDistributionConsentUserAgent = requestUserAgent;

        var updateResult = await _userManager.UpdateAsync(user);

        if (!updateResult.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось сохранить принятие документов.",
                errors = updateResult.Errors.Select(x => x.Description)
            });
        }

        return Ok(await CreateMeResponseAsync(user));
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var normalizedEmail = NormalizeEmail(request.Email);
        var normalizedUserName = NormalizeUserName(request.UserName);
        var firstName = NormalizeRequiredText(request.FirstName, MaxNameLength);
        var lastName = NormalizeOptionalText(request.LastName, MaxNameLength);
        var region = NormalizeOptionalText(request.Region, MaxRegionLength);
        var userAgreementVersion =
            NormalizeOptionalText(request.UserAgreementVersion, MaxConsentVersionLength)
            ?? CurrentUserAgreementVersion;
        var personalDataConsentVersion =
            NormalizeOptionalText(request.PersonalDataConsentVersion, MaxConsentVersionLength)
            ?? CurrentPersonalDataConsentVersion;
        var personalDataDistributionConsentVersion =
            NormalizeOptionalText(request.PersonalDataDistributionConsentVersion, MaxConsentVersionLength)
            ?? CurrentPersonalDataDistributionConsentVersion;

        if (!request.UserAgreementAccepted)
            return BadRequest(new { message = "Для регистрации необходимо принять пользовательское соглашение." });

        if (!request.PersonalDataConsentAccepted)
            return BadRequest(new { message = "Для регистрации необходимо согласие на обработку персональных данных." });

        if (!request.PersonalDataDistributionConsentAccepted)
            return BadRequest(new { message = "Для регистрации необходимо согласие на обработку персональных данных, разрешенных для распространения." });

        if (string.IsNullOrWhiteSpace(normalizedEmail))
            return BadRequest(new { message = "Укажите email." });

        if (string.IsNullOrWhiteSpace(firstName))
            return BadRequest(new { message = "Укажите имя." });

        if (!IsUserNameValid(normalizedUserName))
        {
            return BadRequest(new
            {
                message = "Имя пользователя может содержать только латинские буквы, цифры, точку и нижнее подчёркивание."
            });
        }

        var existingUserByEmail = await _userManager.FindByEmailAsync(normalizedEmail);
        if (existingUserByEmail != null)
            return BadRequest(new { message = "Пользователь с таким email уже существует." });

        var existingUserByName = await _userManager.FindByNameAsync(normalizedUserName);
        if (existingUserByName != null)
            return BadRequest(new { message = "Это имя пользователя уже занято." });

        var acceptedAtUtc = DateTime.UtcNow;
        var requestIp = HttpContext.Connection.RemoteIpAddress?.ToString();
        var requestUserAgent = Request.Headers.UserAgent.ToString();

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = firstName,
            LastName = lastName,
            UserName = normalizedUserName,
            Email = normalizedEmail,
            EmailConfirmed = false,
            Region = region,
            CreatedAt = acceptedAtUtc,
            UserAgreementAccepted = true,
            UserAgreementAcceptedAtUtc = acceptedAtUtc,
            UserAgreementVersion = userAgreementVersion,
            UserAgreementIp = requestIp,
            UserAgreementUserAgent = requestUserAgent,
            PersonalDataConsentAccepted = true,
            PersonalDataConsentAcceptedAtUtc = acceptedAtUtc,
            PersonalDataConsentVersion = personalDataConsentVersion,
            PersonalDataConsentIp = requestIp,
            PersonalDataConsentUserAgent = requestUserAgent,
            PersonalDataDistributionConsentAccepted = true,
            PersonalDataDistributionConsentAcceptedAtUtc = acceptedAtUtc,
            PersonalDataDistributionConsentVersion = personalDataDistributionConsentVersion,
            PersonalDataDistributionConsentIp = requestIp,
            PersonalDataDistributionConsentUserAgent = requestUserAgent
        };

        var result = await _userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось создать пользователя.",
                errors = result.Errors.Select(x => x.Description)
            });
        }

        try
        {
            var code = await _verificationCodeService.CreateCodeAsync(
                user,
                VerificationCodePurpose.EmailConfirmation,
                normalizedEmail,
                HttpContext.Connection.RemoteIpAddress?.ToString());

            await _emailSender.SendEmailConfirmationCodeAsync(normalizedEmail, code);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Не удалось отправить код подтверждения email при регистрации пользователя {UserId}.", user.Id);
            await _userManager.DeleteAsync(user);

            return StatusCode(500, new
            {
                message = "Не удалось отправить код подтверждения. Попробуйте зарегистрироваться позже."
            });
        }

        return Ok(new RegisterResponse
        {
            RequiresEmailConfirmation = true,
            Email = normalizedEmail,
            Message = "Аккаунт создан. Мы отправили код подтверждения на email."
        });
    }

    [HttpPost("confirm-email")]
    public async Task<IActionResult> ConfirmEmail(ConfirmEmailRequest request)
    {
        var email = NormalizeEmail(request.Email);
        var code = NormalizeCode(request.Code);

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code))
            return BadRequest(new { message = "Неверный email или код подтверждения." });

        var user = await _userManager.FindByEmailAsync(email);

        if (user == null)
            return BadRequest(new { message = "Неверный email или код подтверждения." });

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        if (user.EmailConfirmed)
        {
            return Ok(await CreateAuthResponseAsync(user));
        }

        var isCodeValid = await _verificationCodeService.VerifyCodeAsync(
            user,
            VerificationCodePurpose.EmailConfirmation,
            code);

        if (!isCodeValid)
            return BadRequest(new { message = "Неверный или просроченный код подтверждения." });

        user.EmailConfirmed = true;

        var updateResult = await _userManager.UpdateAsync(user);

        if (!updateResult.Succeeded)
            return BadRequest(new { message = "Не удалось подтвердить email." });

        return Ok(await CreateAuthResponseAsync(user));
    }

    [HttpPost("resend-email-code")]
    public async Task<IActionResult> ResendEmailCode(ResendEmailCodeRequest request)
    {
        var email = NormalizeEmail(request.Email);

        if (string.IsNullOrWhiteSpace(email))
        {
            return Ok(new
            {
                message = "Если аккаунт существует и email не подтверждён, мы отправили новый код."
            });
        }

        var user = await _userManager.FindByEmailAsync(email);

        if (user == null)
        {
            return Ok(new
            {
                message = "Если аккаунт существует и email не подтверждён, мы отправили новый код."
            });
        }

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        if (user.EmailConfirmed)
            return BadRequest(new { message = "Email уже подтверждён." });

        try
        {
            var code = await _verificationCodeService.CreateCodeAsync(
                user,
                VerificationCodePurpose.EmailConfirmation,
                email,
                HttpContext.Connection.RemoteIpAddress?.ToString());

            await _emailSender.SendEmailConfirmationCodeAsync(email, code);

            return Ok(new
            {
                message = "Новый код подтверждения отправлен."
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Не удалось повторно отправить код подтверждения email для пользователя {UserId}.", user.Id);

            return StatusCode(500, new
            {
                message = "Не удалось отправить код подтверждения. Попробуйте позже."
            });
        }
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        var email = NormalizeEmail(request.Email);

        if (string.IsNullOrWhiteSpace(email))
        {
            return Ok(new
            {
                message = "Если аккаунт с таким email существует, мы отправили код восстановления."
            });
        }

        var user = await _userManager.FindByEmailAsync(email);

        if (user == null || !user.EmailConfirmed || user.IsBlocked)
        {
            return Ok(new
            {
                message = "Если аккаунт с таким email существует, мы отправили код восстановления."
            });
        }

        try
        {
            var code = await _verificationCodeService.CreateCodeAsync(
                user,
                VerificationCodePurpose.PasswordReset,
                email,
                HttpContext.Connection.RemoteIpAddress?.ToString());

            await _emailSender.SendPasswordResetCodeAsync(email, code);

            return Ok(new
            {
                message = "Если аккаунт с таким email существует, мы отправили код восстановления."
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Не удалось отправить код восстановления пароля для пользователя {UserId}.", user.Id);

            return StatusCode(500, new
            {
                message = "Не удалось отправить код восстановления. Попробуйте позже."
            });
        }
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        var email = NormalizeEmail(request.Email);
        var code = NormalizeCode(request.Code);

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code))
            return BadRequest(new { message = "Неверный email или код восстановления." });

        var user = await _userManager.FindByEmailAsync(email);

        if (user == null || !user.EmailConfirmed || user.IsBlocked)
        {
            return BadRequest(new { message = "Неверный email или код восстановления." });
        }

        var isCodeValid = await _verificationCodeService.VerifyCodeAsync(
            user,
            VerificationCodePurpose.PasswordReset,
            code);

        if (!isCodeValid)
            return BadRequest(new { message = "Неверный или просроченный код восстановления." });

        var identityResetToken = await _userManager.GeneratePasswordResetTokenAsync(user);

        var result = await _userManager.ResetPasswordAsync(
            user,
            identityResetToken,
            request.NewPassword);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось изменить пароль.",
                errors = result.Errors.Select(x => x.Description)
            });
        }

        return Ok(new
        {
            message = "Пароль успешно изменён. Теперь вы можете войти с новым паролем."
        });
    }

    [Authorize]
    [HttpPost("request-password-change-code")]
    public async Task<IActionResult> RequestPasswordChangeCode()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var user = await _userManager.FindByIdAsync(userIdClaim);

        if (user == null)
            return Unauthorized(new { message = "Пользователь не найден." });

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        if (string.IsNullOrWhiteSpace(user.Email) || !user.EmailConfirmed)
            return BadRequest(new { message = "Email не подтверждён. Смена пароля через код недоступна." });

        try
        {
            var code = await _verificationCodeService.CreateCodeAsync(
                user,
                VerificationCodePurpose.PasswordChange,
                user.Email,
                HttpContext.Connection.RemoteIpAddress?.ToString());

            await _emailSender.SendPasswordChangeCodeAsync(user.Email, code);

            return Ok(new
            {
                message = "Код смены пароля отправлен на ваш email."
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Не удалось отправить код смены пароля для пользователя {UserId}.", user.Id);

            return StatusCode(500, new
            {
                message = "Не удалось отправить код смены пароля. Попробуйте позже."
            });
        }
    }

    [Authorize]
    [HttpPost("change-password-with-code")]
    public async Task<IActionResult> ChangePasswordWithCode(ChangePasswordWithCodeRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(userIdClaim))
            return Unauthorized(new { message = "Пользователь не авторизован." });

        var user = await _userManager.FindByIdAsync(userIdClaim);

        if (user == null)
            return Unauthorized(new { message = "Пользователь не найден." });

        if (user.IsBlocked)
            return Unauthorized(new { message = "Пользователь заблокирован." });

        if (string.IsNullOrWhiteSpace(user.Email) || !user.EmailConfirmed)
            return BadRequest(new { message = "Email не подтверждён. Смена пароля через код недоступна." });

        var code = NormalizeCode(request.Code);

        if (string.IsNullOrWhiteSpace(code))
            return BadRequest(new { message = "Неверный или просроченный код смены пароля." });

        var isCodeValid = await _verificationCodeService.VerifyCodeAsync(
            user,
            VerificationCodePurpose.PasswordChange,
            code);

        if (!isCodeValid)
            return BadRequest(new { message = "Неверный или просроченный код смены пароля." });

        var identityResetToken = await _userManager.GeneratePasswordResetTokenAsync(user);

        var result = await _userManager.ResetPasswordAsync(
            user,
            identityResetToken,
            request.NewPassword);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "Не удалось изменить пароль.",
                errors = result.Errors.Select(x => x.Description)
            });
        }

        return Ok(new
        {
            message = "Пароль успешно изменён."
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var email = NormalizeEmail(request.Email);

        if (string.IsNullOrWhiteSpace(email))
            return Unauthorized(new { message = "Неверный email или пароль." });

        var user = await _userManager.FindByEmailAsync(email);
        if (user == null)
            return Unauthorized(new { message = "Неверный email или пароль." });

        var isPasswordValid = await _userManager.CheckPasswordAsync(user, request.Password);
        if (!isPasswordValid)
            return Unauthorized(new { message = "Неверный email или пароль." });

        if (!user.EmailConfirmed)
        {
            return StatusCode(403, new EmailConfirmationRequiredResponse
            {
                Email = user.Email!,
                Message = "Подтвердите email перед входом."
            });
        }

        return Ok(await CreateAuthResponseAsync(user));
    }

    private static bool HasAcceptedCurrentLegalDocuments(AppUser user)
    {
        return user.UserAgreementAccepted
            && user.UserAgreementVersion == CurrentUserAgreementVersion
            && user.PersonalDataConsentAccepted
            && user.PersonalDataConsentVersion == CurrentPersonalDataConsentVersion
            && user.PersonalDataDistributionConsentAccepted
            && user.PersonalDataDistributionConsentVersion == CurrentPersonalDataDistributionConsentVersion;
    }

    private async Task<object> CreateMeResponseAsync(AppUser user)
    {
        var legalDocumentsAccepted = HasAcceptedCurrentLegalDocuments(user);

        return new
        {
            user.Id,
            user.UserName,
            user.FirstName,
            user.LastName,
            DisplayName = GetDisplayName(user),
            user.Email,
            user.EmailConfirmed,
            user.Region,
            user.About,
            AvatarUrl = user.IsBlocked ? null : user.AvatarUrl,
            user.CreatedAt,
            user.ChatToastsEnabled,
            user.HideChatMessageTextInNotifications,
            user.UserAgreementAccepted,
            user.UserAgreementAcceptedAtUtc,
            user.UserAgreementVersion,
            user.PersonalDataConsentAccepted,
            user.PersonalDataConsentAcceptedAtUtc,
            user.PersonalDataConsentVersion,
            user.PersonalDataDistributionConsentAccepted,
            user.PersonalDataDistributionConsentAcceptedAtUtc,
            user.PersonalDataDistributionConsentVersion,
            LegalDocumentsAccepted = legalDocumentsAccepted,
            LegalDocumentsRequired = !legalDocumentsAccepted,
            IsAdmin = await _userManager.IsInRoleAsync(user, "Admin"),
            user.IsBlocked,
            user.BlockReasonCode,
            BlockReasonText = GetBlockReasonDisplayText(user),
            user.BlockedAtUtc,
            CurrentUserAgreementVersion,
            CurrentPersonalDataConsentVersion,
            CurrentPersonalDataDistributionConsentVersion
        };
    }

    private async Task<AuthResponse> CreateAuthResponseAsync(AppUser user)
    {
        return new AuthResponse
        {
            Token = GenerateJwtToken(user),
            UserName = user.UserName!,
            FirstName = user.FirstName,
            LastName = user.LastName,
            DisplayName = GetDisplayName(user),
            Email = user.Email!,
            EmailConfirmed = user.EmailConfirmed,
            IsAdmin = await _userManager.IsInRoleAsync(user, "Admin"),
            IsBlocked = user.IsBlocked,
            BlockReasonCode = user.BlockReasonCode,
            BlockReasonText = GetBlockReasonDisplayText(user),
            BlockedAtUtc = user.BlockedAtUtc,
            UserAgreementAccepted = user.UserAgreementAccepted,
            UserAgreementVersion = user.UserAgreementVersion,
            PersonalDataConsentAccepted = user.PersonalDataConsentAccepted,
            PersonalDataConsentVersion = user.PersonalDataConsentVersion,
            PersonalDataDistributionConsentAccepted = user.PersonalDataDistributionConsentAccepted,
            PersonalDataDistributionConsentVersion = user.PersonalDataDistributionConsentVersion,
            LegalDocumentsAccepted = HasAcceptedCurrentLegalDocuments(user),
            LegalDocumentsRequired = !HasAcceptedCurrentLegalDocuments(user),
            ChatToastsEnabled = user.ChatToastsEnabled,
            HideChatMessageTextInNotifications = user.HideChatMessageTextInNotifications
        };
    }


    private static string? GetBlockReasonDisplayText(AppUser user)
    {
        if (!user.IsBlocked)
            return null;

        var labels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["nudity"] = "Нагота или материалы сексуального характера",
            ["drugs"] = "Наркотики или запрещённые вещества",
            ["illegal_ads"] = "Реклама запрещённых товаров или услуг",
            ["spam"] = "Спам или массовая реклама",
            ["abuse"] = "Оскорбления, угрозы или травля",
            ["fraud"] = "Мошенничество или попытка обмана",
            ["rules"] = "Нарушение правил сервиса",
            ["other"] = "Другая причина"
        };

        string? label = null;
        var hasLabel = !string.IsNullOrWhiteSpace(user.BlockReasonCode) &&
                       labels.TryGetValue(user.BlockReasonCode, out label);

        if (!string.IsNullOrWhiteSpace(user.BlockReasonText))
        {
            return hasLabel &&
                   !string.IsNullOrWhiteSpace(label) &&
                   !string.Equals(user.BlockReasonCode, "other", StringComparison.OrdinalIgnoreCase)
                ? $"{label}. {user.BlockReasonText}"
                : user.BlockReasonText;
        }

        return hasLabel && !string.IsNullOrWhiteSpace(label)
            ? label
            : "Нарушение правил сервиса";
    }

    private string GenerateJwtToken(AppUser user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.UniqueName, user.UserName ?? string.Empty),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.UserName ?? string.Empty)
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_jwtSettings.ExpiresInMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string GetDisplayName(AppUser user)
    {
        var fullName = $"{user.FirstName} {user.LastName}".Trim();

        return string.IsNullOrWhiteSpace(fullName)
            ? user.UserName ?? "Пользователь"
            : fullName;
    }

    private static string NormalizeEmail(string? email)
    {
        return (email ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static string NormalizeUserName(string? userName)
    {
        return (userName ?? string.Empty).Trim().TrimStart('@').ToLowerInvariant();
    }

    private static string NormalizeRequiredText(string? value, int maxLength)
    {
        var normalized = value?.Trim() ?? string.Empty;
        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string? NormalizeOptionalText(string? value, int maxLength)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        return normalized.Length <= maxLength ? normalized : normalized[..maxLength];
    }

    private static string NormalizeCode(string? code)
    {
        var normalized = (code ?? string.Empty).Trim();
        return normalized.Length <= MaxCodeLength ? normalized : normalized[..MaxCodeLength];
    }

    private static bool IsUserNameValid(string userName)
    {
        return Regex.IsMatch(userName, @"^[a-zA-Z0-9._]{3,30}$");
    }
}
