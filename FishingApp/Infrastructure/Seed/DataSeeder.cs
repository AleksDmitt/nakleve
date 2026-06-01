using FishingApp.Domain.Entities;
using FishingApp.Domain.Enums;
using FishingApp.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FishingApp.Infrastructure.Seed;

public static class DataSeeder
{
    public static async Task SeedAsync(AppDbContext context)
    {
        await context.Database.MigrateAsync();

        await SeedRolesAsync(context);
        await SeedChatsAsync(context);
    }


    private static async Task SeedRolesAsync(AppDbContext context)
    {
        var adminRoleExists = await context.Roles.AnyAsync(x => x.Name == "Admin");

        if (!adminRoleExists)
        {
            context.Roles.Add(new IdentityRole<Guid>
            {
                Id = Guid.NewGuid(),
                Name = "Admin",
                NormalizedName = "ADMIN",
                ConcurrencyStamp = Guid.NewGuid().ToString()
            });

            await context.SaveChangesAsync();
        }
    }

    private static async Task SeedChatsAsync(AppDbContext context)
    {
        var globalChatExists = await context.Chats
            .AnyAsync(x => x.Type == ChatType.Global && x.Name == "Общий чат");

        if (!globalChatExists)
        {
            context.Chats.Add(new Chat
            {
                Id = Guid.NewGuid(),
                Name = "Общий чат",
                Type = ChatType.Global,
                Region = null,
                CreatedAt = DateTime.UtcNow
            });

            await context.SaveChangesAsync();
        }
    }
}