__doc__ = 'This module contains various support classes including vector \
and matrix support, rendering support, time management and other various \
classes ' 

from math import sin, cos, acos, asin, radians, atan2, sqrt, degrees
import pygame
from random import uniform

class Global:
	""" Global Variables """
	
	canvas = None # Main Surface
	window = () # Window size tuple
	enemies = []
	bullets = []
	particles = []
	deathstars = []
	score = 0
	lives = 3
	milliseconds = 0
	dt = 0
	SpaceShip_position = ()
	SpaceShip_direction = ()
	sounds = {}

	
class Time:
	""" Time Management class"""
	
	def __init__(self):
		""" Grabs the number of microseconds since pygame.init"""
		self.time = pygame.time.get_ticks()
		
	def period(self):
		""" Returns the number of microseconds since instance was initiated """
		return pygame.time.get_ticks()-self.time
		
	def grandfather(self):
		""" Updates the Globals, called from app class """
		# change in time over main loop
		Global.dt = self.period()
		# number of microseconds since main loop initiation
		Global.milliseconds += Global.dt
		
	def reset(self):
		"""Resets the timer"""
		self.__init__()
		
	def __gt__(self,other):
		"""Returns true if the number specified is greater than the time period """
		return self.period() > (other*1000)

	def __lt__(self,other):
		"""Returns true if the number specified is less than the time period """
		return self.period() < (other*1000)
		
	

class System: #library
	""" Contains various housekeeping methods """
	
	def __init__(self):
		""" Main init, called from app module """
		pygame.init()
		pygame.display.init()
		pygame.display.set_caption("Death by Geometry")
		pygame.mixer.pre_init()
		self.load_sounds()
		# Play Start up sound
		self.play('start.wav')
		self._loop = True
		Global.canvas = pygame.display.set_mode((0, 0),pygame.FULLSCREEN | pygame.DOUBLEBUF)
		Global.window = Global.canvas.get_width(),Global.canvas.get_height()
		# defines the vector origin to be the middle of screen
		Vector.origin = Global.canvas.get_width()/2, Global.canvas.get_height()/2
		
		
	def play(self,filename):
		""" Plays a specified sound """
		Global.sounds[filename].play()
	
	def load_sounds(self):
		""" Loads all sounds from sounds directory """
		self.sounds = 'pinwheel.wav','die.wav','square.wav','start.wav', \
		'rhombus.wav','crash.wav' ,'triangle2.wav','octagon.wav','deathstar.wav',\
		'deathstar2.wav','die1.wav'
		for filename in self.sounds:
			Global.sounds[filename] = pygame.mixer.Sound('sounds/'+filename)
	
	def accelerate(self):
		""" Moves an objects by summing partial displacements,using the change
			in time over the main loop to maintain speed across all computers
			the speed is in terms of pixels/millisecond """
		self.position +=  ~self.direction*self.speed*Global.dt
	
	def mouse_visible(self,x):
		""" Controls mouse visibility True -> visible, False -> invisible"""
		pygame.mouse.set_visible(x)
		
	def background(self):
		""" Fill the main surface black"""
		Global.canvas.fill(0x0)
		
	def events(self):
		""" Returns events """
		return pygame.event.get()

	def window_close(self):
		""" Quits pygame module """
		pygame.quit()
		
	def get_mouse_position(self):
		""" Returns the mouse position in a tuple relative to the vector origin"""
		return -Vector.origin[0] + pygame.mouse.get_pos()[0], \
		Vector.origin[1] - pygame.mouse.get_pos()[1]

	def flip(self):
		""" Updates the surface """
		pygame.display.flip()

class Vector:
	"""Vector class to handle vector arithmetic."""
	
	# Global orientation vector
	origin = 0,0
	
	def __init__(self,x=None,y=None):
		"""Initiates Vector class, creates a random vector if arguments are 
		undefined """
		
		if x is None:
			x = uniform(-1,1)
		if y is None:
			y = uniform(-1,1)
	
		self.x,self.y = x,y

	def __iadd__(self,other):
		""" Vector += Vector or tuple or list
			__iadd__(Vector,Vector or tuple or list) -> Vector"""
			
		self.x,self.y = self.__add__(other).tupl()
		return self
	
	def __isub__(self,other):
		self.x,self.y = self.__sub__(other).tupl()
		return self

	def __imul__(self,other):
		self.x,self.y = self.__mul__(other).tupl()
		return self
		
	def __add__(self,other):
		""" Vector addition """
		if isinstance(other,Vector):
			return Vector(self.x+other.x,self.y+other.y)
		else:
			return Vector(self.x+other[0],self.y+other[1])
			
	def __sub__(self,other):
		if isinstance(other,Vector):
			return Vector(self.x-other.x,self.y-other.y)
		else:
			return Vector(self.x-other[0],self.y-other[1])

	def __mul__(self,other):
		if isinstance(other,int) or isinstance(other,float):
			return Vector(self.x*other,self.y*other)
		else:
			return Vector(self.x*other[0],self.y*other[1])
	
	def dot(self,other):
		""" Dot product """
		return self.x*other.x+self.y*other.y
	
	def __radd__(self,other):
		return self.__add__(other)
		
	def __rsub__(self,other):
		return self.__sub__(other)
		
	def __rmul__(self,other):
		return self.__mul__(other)
		
	def __abs__(self):
		""" Returns the magnitude of the vector """
		return sqrt(self.dot(self))

	def __invert__(self):
		""" Returns unit vector """
		if abs(self) > 0:
			return self*(1/abs(self))
		else:
			return self
			
	def __getitem__(self,key):
		return (self.x,self.y)[key]
		
	def angle(self):
		""" Angle Between Vector and positive x-axis
			angle(Vector) -> float"""
		return degrees(atan2(self.y, self.x))

	def tupl(self):
		return self.x,self.y

	def literal(self):
		""" Returns Position from the top left corner from origin orientated Vectors.
			literal(Vector) -> Vector"""
		return Vector(int(Vector.origin[0] + self.x), int(Vector.origin[1] - self.y))
	
	def __neg__(self):
		return -1*self
	
class Matrix:
	""" Matrix Arithmetic """
	
	def __init__(self):
		self.matrix = ()
		
	def __getitem__(self,key):
		return self.matrix[key]

	def scale(self,factor):
		""" Scale matrix """
		for m in range(len(self.matrix)):
			for n in range(len(self.matrix[m])):
				self.matrix[m][n] *= factor
			
	def copy(self):
		""" Return deep copy of matrix """
		return [vector[:] for vector in self.matrix]
	
	def rotate(self,angle):
		""" Rotate matrix """
		angle = radians(angle)
		if angle != 0.0:
			for m in range(len(self.matrix)):
				self.matrix[m][0] = self.original[m][0]*cos(angle)-\
				self.original[m][1]*sin(angle)
				self.matrix[m][1] = self.original[m][0]*sin(angle)+\
				self.original[m][1]*cos(angle)

class Render():
	""" Render Class """
	def render(self,):
		""" blits object to screen if reload method returns None """
		if not self.reload():	
			self.blit(self.image, (self.position.literal() - self.center).tupl())

	def play(self,filename):
		""" Plays a specified sound """
		Global.sounds[filename].play()
	
	def blit(self,image,position):
		Global.canvas.blit(image,position)

	def accelerate(self):
		""" Moves an objects by summing partial displacements,using the change
			in time over the main loop to maintain speed across all computers
			the speed is in terms of pixels/millisecond """
		self.position +=  ~self.direction*self.speed*Global.dt

class Draw(Matrix):

	def accelerate(self):
		""" Moves an objects by summing partial displacements,using the change
			in time over the main loop to maintain speed across all computers
			the speed is in terms of pixels/millisecond """
		self.position +=  ~self.direction*self.speed*Global.dt


	def play(self,filename):
		""" Plays a specified sound """
		Global.sounds[filename].play()
	
	def nice_circle(self,position,radius,color,color2):
		""" Pretty Circle """
		self.circle(position,color2,radius-1)
		self.circle(position,color,radius)
		self.circle(position,color2,radius+1)
	
	def circle(self,position,color,radius,width=1):
		""" Draw Circle """
		pygame.draw.circle(Global.canvas, color, position.literal().tupl(), radius,
		 width)

	def line(self,point1,point2,color):
		""" Draw Line """
		pygame.draw.aaline(Global.canvas, color, point1.literal().tupl(), 
		point2.literal().tupl(),1)
	
	def nice_line(self,point1,point2,color,color2):
		""" Pretty Line """
		
		self.line(point1-(1,0),point2-(1,0),color2)
		self.line(point1,point2,color)
		self.line(point1+(0,1),point2+(1,0),color2)
		
	def trace(self):
		""" Draws a series of lines from points given in a matrix joining the last 
		point in the matrix the first point"""
		if not self.reload():	
			for i in range(len(self.matrix)):
				if (len(self.matrix)-1) == i:
					self.nice_line(self.position+self.matrix[i],self.position+self.matrix[0],self.color
					,self.color2)
				else:
					self.nice_line(self.position+self.matrix[i],self.position+self.matrix[i+1],self.color
					,self.color2)
		
class Text(Render):
	""" Text Class """
	def __init__(self,fontsize=24,font='Arial'):
		""" Initiates Font size, color, position and Font family"""
		self.x,self.y = 0,0
		self.position = Vector(0,0)
		self.center = 0,0
		self.fontfamily = font
		self.fontsize = fontsize
		self.color = 32,255,32
		self.font = pygame.font.SysFont(self.fontfamily, self.fontsize)
		
	def __lshift__(self,other):
		""" Stores a string representation of a an object into the text """
		self.text = str(other)
		return self
	
	def reload(self):
		""" Reloads the font object """ 
		self.image = self.font.render(self.text,True,self.color)
	
	def log(self,filename):
		""" Appends Text to a log file """
		try:
			log = open(filename,'a')
		except IOError:
			pass
		else:
			log.write(self.text + "\n")
			log.close()
			
			
class Sprite(Render):
	""" Sprite Base Class """
	
	def convert(self):
		""" Convert Image to alpha """
		self.image.convert_alpha()
		
	def load_image(self):
		""" Convert image into pixel information """
		self.image = pygame.image.load('gfx/' + self.image)
		
	def load(self):
		""" Prepare image, produce a copy and find the center """
		self.load_image()
		self.convert()
		self.original = self.image
		self.center = self.get_center()
		
	def rotate(self,angle):
		""" Rotates an image, and redefines the center """
		self.image = pygame.transform.rotate(self.original, angle)
		self.center = self.get_center()
		
	def transparency(self,x):
		""" Modifies image transparency x = 0 => Transparent, x = 255 =>
			Opaque """
		self.image.set_alpha(x)
		
	def get_center(self):
		""" Returns the image center in a tuple """
		return self.image.get_width()/2, self.image.get_height()/2
		
	def destruct(self):
		""" Base destruct method """
		pass
		
	def reload(self):
		""" Base reload method """
		pass
		
