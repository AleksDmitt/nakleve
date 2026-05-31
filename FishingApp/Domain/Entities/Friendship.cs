using FishingApp.Domain.Enums;

namespace FishingApp.Domain.Entities;

public class Friendship
{
    public Guid Id { get; set; }

    public Guid RequesterId { get; set; }
    public Guid AddresseeId { get; set; }

    public FriendshipStatus Status { get; set; } = FriendshipStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public AppUser Requester { get; set; } = null!;
    public AppUser Addressee { get; set; } = null!;
}