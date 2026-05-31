using System.ComponentModel.DataAnnotations;

namespace FishingApp.Api.DTOs.Auth;

public class AcceptLegalDocumentsRequest
{
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
