

# Question 1    ->  11 = x mod 6
x = 11 % 6

# Question 2    ->  8146798528947 = y mod 17
y = 8146798528947 % 17

print("x =", x)
print("y =", y)

# The challenge asks for the smaller value
print("Answer =", min(x, y))

print()

# proof
# 4 + 9 = 1
# 5 - 7 = 10
# 2 + 3 = 5

print( "4 + 9 =" , (4 + 9) % 12 )
print( "5 - 7 =" , (5 - 7) % 12 )
print( "2 + 3 =" , (2 + 3) % 12 )

# % 12 behaves like a 12-hour clock.
# Divide by 12 and keep only the remainder.
#
# Example:
# 5 PM + 8 hours = 13 hours -> 13 % 12 = 1 -> 1 AM
# 2 AM - 3 hours = -1 hour -> -1 % 12 = 11 -> 11 PM